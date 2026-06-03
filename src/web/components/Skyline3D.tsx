import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import * as THREE from "three";
import { CalendarDay } from "../../core/types.js";
import { useTheme } from "../theme.js";

interface Props {
  days: CalendarDay[];
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
}

// Forest-green ramp, matching the 2D heatmap levels.
const LEVEL_COLORS = ["#1b2616", "#2f5138", "#46824f", "#6fae5f", "#a7d98a"];

// Tallest building in world units when count === scaleMax.
const MAX_HEIGHT = 7;
// Footprint of each building (grid cells are 1 unit apart, so < 1 = streets).
const FOOTPRINT = 0.74;

interface Bar {
  date: string;
  count: number;
  level: number;
  col: number;
  row: number;
}

function buildBars(days: CalendarDay[], window: number): Bar[] {
  const today = new Date().toISOString().slice(0, 10);
  const recent = days.filter((d) => d.date <= today).slice(-window);
  if (!recent.length) return [];
  const firstDow = new Date(recent[0].date + "T00:00:00Z").getUTCDay();
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

function Bars({
  bars,
  numWeeks,
  scaleMax,
  colors,
  onHover,
  onSelect,
}: {
  bars: Bar[];
  numWeeks: number;
  scaleMax: number;
  colors: string[];
  onHover: (b: Bar | null) => void;
  onSelect?: (date: string) => void;
}) {
  // Unit cube scaled per building, so geometry + materials are shared.
  const geometry = useMemo(
    () => new THREE.BoxGeometry(FOOTPRINT, 1, FOOTPRINT),
    [],
  );
  const materials = useMemo(
    () =>
      colors.map(
        (c, i) =>
          new THREE.MeshStandardMaterial({
            color: c,
            roughness: 0.55,
            metalness: 0.05,
            emissive: new THREE.Color(c),
            emissiveIntensity: i >= 3 ? 0.35 : 0.08,
          }),
      ),
    [colors],
  );

  const offsetX = numWeeks / 2;
  return (
    <group>
      {bars.map((b) => {
        // Absolute scale: count maps to height against a shared reference
        // (scaleMax), so the same count is the same height for any user.
        const ratio = Math.min(1, b.count / scaleMax);
        const h = b.count === 0 ? 0.06 : 0.25 + ratio * MAX_HEIGHT;
        const x = b.col - offsetX;
        const z = b.row - 3;
        return (
          <mesh
            key={b.date}
            geometry={geometry}
            material={materials[b.level]}
            position={[x, h / 2, z]}
            scale={[1, h, 1]}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHover(b);
            }}
            onPointerOut={() => onHover(null)}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(b.date);
            }}
          />
        );
      })}
    </group>
  );
}

function Ground({ numWeeks, color }: { numWeeks: number; color: string }) {
  // A thin slab under the city for a "map" feel.
  const w = numWeeks + 1.5;
  const d = 8.5;
  return (
    <mesh position={[0, -0.06, 0]} receiveShadow>
      <boxGeometry args={[w, 0.12, d]} />
      <meshStandardMaterial color={color} roughness={0.95} metalness={0} />
    </mesh>
  );
}

export function Skyline3D({
  days,
  window = 371,
  onSelect,
  scaleMax,
  colors = LEVEL_COLORS,
}: Props) {
  const { theme } = useTheme();
  const light = theme === "light";
  const bgColor = light ? "#eef1e6" : "#0f1310";
  const groundColor = light ? "#dde3cf" : "#11160f";
  const [hover, setHover] = useState<Bar | null>(null);
  const bars = useMemo(() => buildBars(days, window), [days, window]);
  const numWeeks = bars.length ? Math.max(...bars.map((b) => b.col)) + 1 : 0;
  const ownMax = Math.max(1, ...bars.map((b) => b.count));
  // Use the caller's shared reference when given (for fair user-vs-user
  // comparison); otherwise scale to this user's own busiest day.
  const effectiveMax = scaleMax && scaleMax > 0 ? scaleMax : ownMax;

  if (!bars.length) {
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
        <directionalLight position={[18, 30, 12]} intensity={light ? 1.3 : 1.1} />
        <directionalLight position={[-20, 14, -10]} intensity={0.35} />
        <Ground numWeeks={numWeeks} color={groundColor} />
        <Bars
          bars={bars}
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
            {new Date(hover.date + "T00:00:00Z").toLocaleDateString(undefined, {
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
