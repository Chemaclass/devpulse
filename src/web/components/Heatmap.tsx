import { CalendarDay } from "../../core/types.js";

interface Props {
  days: CalendarDay[];
  /** number of trailing days to show (default ~53 weeks) */
  window?: number;
  selectedDate?: string | null;
  onSelect?: (date: string) => void;
}

export function Heatmap({
  days,
  window = 371,
  selectedDate,
  onSelect,
}: Props) {
  const recent = days.slice(-window);
  // Pad the start so the first column begins on a Sunday-aligned grid.
  const cells: (CalendarDay | null)[] = [];
  if (recent.length) {
    const firstDow = new Date(recent[0].date + "T00:00:00Z").getUTCDay();
    for (let i = 0; i < firstDow; i++) cells.push(null);
  }
  cells.push(...recent);

  return (
    <div className="heatmap-wrap">
      <div className="heatmap">
        {cells.map((d, i) =>
          d ? (
            <div
              key={d.date}
              className={`cell l${d.level}${
                selectedDate === d.date ? " sel" : ""
              }`}
              title={`${d.date}: ${d.count} contribution${
                d.count === 1 ? "" : "s"
              }`}
              onClick={() => onSelect?.(d.date)}
              style={{ cursor: onSelect ? "pointer" : "default" }}
            />
          ) : (
            <div key={`pad-${i}`} className="cell" style={{ opacity: 0 }} />
          ),
        )}
      </div>
      <div className="legend">
        <span>Less</span>
        <span className="cell" />
        <span className="cell l1" />
        <span className="cell l2" />
        <span className="cell l3" />
        <span className="cell l4" />
        <span>More</span>
      </div>
    </div>
  );
}
