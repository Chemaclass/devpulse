import { CountUp } from "./CountUp.js";

export function StatTile({
  className,
  icon,
  value,
  label,
  sub,
}: {
  className?: string;
  icon: string;
  value: string;
  label: string;
  sub?: string;
}) {
  return (
    <div className={`stat ${className ?? ""}`}>
      <span className="spark-icon">{icon}</span>
      <div className="value">
        <CountUp value={value} />
      </div>
      <div className="label">{label}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
