import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
} from "three";
import { parseUTCDate, todayISO } from "../../core/dates.js";
import { TCalendarDay } from "../../core/types.js";
import { useTheme } from "../theme.js";

type TProps = {
  days: TCalendarDay[];
  window?: number;
  onSelect?: (date: string) => void;
  /**
   * Reference daily count that maps to the tallest building. Pass a shared
   * value (e.g. the max across both users) so two skylines stay visually
   * comparable. Defaults to this user's own busiest day.
   */
  scaleMax?: number;
  /** Optional 5-step color ramp (level 0..4). Defaults to forest green. */
  colors?: string[];
};

// Forest-green ramp, matching the 2D heatmap levels.
const LEVEL_COLORS = ["#243a1f", "#2f5138", "#46824f", "#6fae5f", "#a7d98a"];
const TRUNK_COLOR = "#5b4329";

type TTree = {
  date: string;
  count: number;
  level: number;
  col: number;
  row: number;
};

function buildTrees(days: TCalendarDay[], window: number): TTree[] {
  const today = todayISO();
  const recent = days.filter((d) => d.date <= today).slice(-window);
  const first = recent[0];
  if (!first) return [];
  const firstDow = parseUTCDate(first.date).getUTCDay();
  return recent.map((d, i) => {
    const idx = i + firstDow;
    return {
      date: d.date,
      count: d.count,
      level: d.level,
      col: Math.floor(idx / 7),
      row: idx % 7,
    };
  });
}

function Forest({
  trees,
  numWeeks,
  scaleMax,
  colors,
  onHover,
  onSelect,
}: {
  trees: TTree[];
  numWeeks: number;
  scaleMax: number;
  colors: string[];
  onHover: (t: TTree | null) => void;
  onSelect?: ((date: string) => void) | undefined;
}) {
  // Unit geometries scaled per tree, so everything is shared (5 foliage
  // materials + 1 trunk material, two geometries total).
  const coneGeo = useMemo(() => new ConeGeometry(1, 1, 7), []);
  const trunkGeo = useMemo(() => new CylinderGeometry(0.08, 0.11, 1, 6), []);
  const foliageMats = useMemo(
    () =>
      colors.map(
        (c, i) =>
          new MeshStandardMaterial({
            color: c,
            roughness: 0.78,
            metalness: 0,
            emissive: new Color(c),
            emissiveIntensity: i >= 3 ? 0.22 : 0.04,
            flatShading: true,
          }),
      ),
    [colors],
  );
  const trunkMat = useMemo(
    () => new MeshStandardMaterial({ color: TRUNK_COLOR, roughness: 0.9 }),
    [],
  );

  const offsetX = numWeeks / 2;
  return (
    <group>
      {trees.map((t) => {
        // Empty days use the level-0 tone; trees use their own level. Guard the
        // lookup in case a caller passes fewer colors than contribution levels.
        const foliage = foliageMats[t.count === 0 ? 0 : t.level];
        if (!foliage) return null;
        // Absolute scale against a shared reference, so the same count is the
        // same tree height for any user (fair side-by-side comparison).
        const ratio = Math.min(1, t.count / scaleMax);
        const x = t.col - offsetX;
        const z = t.row - 3;
        const handlers = {
          onPointerOver: (e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            onHover(t);
          },
          onPointerOut: () => onHover(null),
          onClick: (e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            onSelect?.(t.date);
          },
        };

        // Empty day: a small bare mound instead of a tree.
        if (t.count === 0) {
          return (
            <mesh
              key={t.date}
              geometry={coneGeo}
              material={foliage}
              position={[x, 0.07, z]}
              scale={[0.24, 0.16, 0.24]}
              {...handlers}
            />
          );
        }

        const trunkH = 0.3 + ratio * 0.5;
        const foliageH = 0.7 + ratio * 5;
        const r = 0.34 + ratio * 0.22;
        return (
          <group key={t.date} position={[x, 0, z]} {...handlers}>
            <mesh
              geometry={trunkGeo}
              material={trunkMat}
              position={[0, trunkH / 2, 0]}
              scale={[1, trunkH, 1]}
            />
            <mesh
              geometry={coneGeo}
              material={foliage}
              position={[0, trunkH + foliageH / 2, 0]}
              scale={[r, foliageH, r]}
            />
          </group>
        );
      })}
    </group>
  );
}

function Ground({ numWeeks, color }: { numWeeks: number; color: string }) {
  // A thin slab of forest floor under the trees.
  const w = numWeeks + 1.5;
  const d = 8.5;
  return (
    <mesh position={[0, -0.06, 0]} receiveShadow>
      <boxGeometry args={[w, 0.12, d]} />
      <meshStandardMaterial color={color} roughness={1} metalness={0} />
    </mesh>
  );
}

export function Skyline3D({
  days,
  window = 371,
  onSelect,
  scaleMax,
  colors = LEVEL_COLORS,
}: TProps) {
  const { theme } = useTheme();
  const light = theme === "light";
  const bgColor = light ? "#eef1e6" : "#0f1310";
  const groundColor = light ? "#cdd8b8" : "#13200f";
  const [hover, setHover] = useState<TTree | null>(null);
  const trees = useMemo(() => buildTrees(days, window), [days, window]);
  const numWeeks = trees.length ? Math.max(...trees.map((t) => t.col)) + 1 : 0;
  const ownMax = Math.max(1, ...trees.map((t) => t.count));
  // Use the caller's shared reference when given (for fair user-vs-user
  // comparison); otherwise scale to this user's own busiest day.
  const effectiveMax = scaleMax && scaleMax > 0 ? scaleMax : ownMax;

  if (!trees.length) {
    return <p className="muted">No contributions to render.</p>;
  }

  return (
    <div className="skyline">
      <Canvas
        camera={{ position: [0, 22, 34], fov: 38 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={[bgColor]} />
        <ambientLight intensity={light ? 0.85 : 0.6} />
        <directionalLight
          position={[18, 30, 12]}
          intensity={light ? 1.3 : 1.1}
        />
        <directionalLight position={[-20, 14, -10]} intensity={0.35} />
        <Ground numWeeks={numWeeks} color={groundColor} />
        <Forest
          trees={trees}
          numWeeks={numWeeks}
          scaleMax={effectiveMax}
          colors={colors}
          onHover={setHover}
          onSelect={onSelect}
        />
        <OrbitControls
          enablePan={false}
          enableZoom
          minDistance={14}
          maxDistance={60}
          maxPolarAngle={Math.PI / 2.1}
          autoRotate
          autoRotateSpeed={0.6}
        />
      </Canvas>
      <div className="skyline-hint">Drag to orbit · scroll to zoom</div>
      {hover && (
        <div className="skyline-tip">
          <strong>{hover.count}</strong> contribution
          {hover.count === 1 ? "" : "s"}
          <span>
            {parseUTCDate(hover.date).toLocaleDateString(undefined, {
              weekday: "short",
              year: "numeric",
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}
          </span>
        </div>
      )}
    </div>
  );
}
