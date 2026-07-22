import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bird,
  Briefcase,
  Bug,
  Building2,
  Cake,
  Calendar,
  CalendarDays,
  CalendarRange,
  Check,
  Clipboard,
  Compass,
  Crown,
  Dna,
  Dot,
  Eye,
  Flame,
  Gem,
  GitCommitHorizontal,
  GitPullRequest,
  Globe,
  Hammer,
  Handshake,
  Heart,
  Info,
  KeyRound,
  Laptop,
  Link2,
  LockOpen,
  Map as MapIcon,
  MapPin,
  Medal,
  Moon,
  Package,
  Rocket,
  Shield,
  SlidersHorizontal,
  Sprout,
  Star,
  Sun,
  Sunrise,
  Sunset,
  Swords,
  Trophy,
  TreePine,
  Umbrella,
  Zap,
} from "lucide-react";

/** Strip emoji variation selectors so "☀️" and "☀" resolve to the same icon. */
const normalize = (glyph: string): string =>
  glyph.replace(/[\uFE0E\uFE0F]/g, "");

// Emoji glyph -> SVG icon. The glyph stays the single source of truth across
// core (CLI markdown renders it as text) and web (this maps it to an SVG), so
// no data shape has to change to swap emojis for crisp, theme-aware icons.
const GLYPHS: ReadonlyMap<string, LucideIcon> = new Map(
  Object.entries({
    "⚡": Zap,
    "🔗": Link2,
    "⚔️": Swords,
    "📋": Clipboard,
    "✓": Check,
    "♥": Heart,
    "🏢": Building2,
    "📍": MapPin,
    "🌱": Sprout,
    "🏅": Medal,
    ℹ️: Info,
    "🔥": Flame,
    "📅": Calendar,
    "🏆": Trophy,
    "⬆️": GitCommitHorizontal,
    "🔀": GitPullRequest,
    "🐛": Bug,
    "👀": Eye,
    "📦": Package,
    "•": Dot,
    "🦉": Bird,
    "🐓": Sunrise,
    "☀️": Sun,
    "🌆": Sunset,
    "🌙": Moon,
    "🛡️": Shield,
    "🚀": Rocket,
    "🗺️": MapIcon,
    "🔨": Hammer,
    "🎛️": SlidersHorizontal,
    "📆": CalendarDays,
    "🏖️": Umbrella,
    "💼": Briefcase,
    "🗓️": CalendarRange,
    "🐝": Activity,
    "🌟": Star,
    "💎": Gem,
    "🧭": Compass,
    "🌍": Globe,
    "🎂": Cake,
    "🌳": TreePine,
    "🧬": Dna,
    "🤝": Handshake,
    "💻": Laptop,
    "👑": Crown,
    "🔓": LockOpen,
    "🔑": KeyRound,
  }).map(([glyph, icon]) => [normalize(glyph), icon]),
);

export type TIconProps = {
  /** Emoji glyph used as the icon key (the cross-platform source of truth). */
  glyph: string;
  /** Size in px or any CSS length; defaults to 1em so it tracks font-size. */
  size?: number | string;
  className?: string;
  /** Accessible name. Omit for decorative icons (rendered aria-hidden). */
  label?: string;
};

/** Render an emoji glyph as a crisp, currentColor SVG icon. */
export function Icon({ glyph, size = "1em", className, label }: TIconProps) {
  const Glyph = GLYPHS.get(normalize(glyph));
  const cls = ["dp-icon", className].filter(Boolean).join(" ");

  // Unknown glyph: fall back to the literal emoji so nothing silently vanishes.
  if (!Glyph) {
    return (
      <span
        className={cls}
        aria-hidden={label ? undefined : true}
        aria-label={label}
      >
        {glyph}
      </span>
    );
  }

  return (
    <Glyph
      className={cls}
      size={size}
      strokeWidth={2}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
