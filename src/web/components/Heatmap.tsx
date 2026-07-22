import { memo, useCallback, useMemo, useState } from "react";
import { computeStreaks } from "../../core/contributions.js";
import { parseUTCDate, todayISO } from "../../core/dates.js";
import { TCalendarDay } from "../../core/types.js";

type TProps = {
  days: TCalendarDay[];
  /** number of trailing days to show (default ~53 weeks) */
  window?: number;
  selectedDate?: string | null;
  onSelect?: (date: string) => void;
};

const WEEKDAYS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type THover = {
  day: TCalendarDay;
  x: number;
  y: number;
};

export const Heatmap = memo(function Heatmap({
  days,
  window = 371,
  selectedDate,
  onSelect,
}: TProps) {
  const [hover, setHover] = useState<THover | null>(null);

  const recent = useMemo(() => {
    // The contributions API pads the calendar to year-end with empty future
    // days. Drop anything after today so the grid ends "now" instead of
    // trailing months of blanks (which also garbled the month labels).
    const today = todayISO();
    const upToToday = days.filter((d) => d.date <= today);
    return upToToday.slice(-window);
  }, [days, window]);
  const streaks = useMemo(() => {
    const total = recent.reduce((s, d) => s + d.count, 0);
    return { total, ...computeStreaks(recent) };
  }, [recent]);

  // Pad the start so the first column begins on a Sunday-aligned grid.
  const cells: (TCalendarDay | null)[] = useMemo(() => {
    const out: (TCalendarDay | null)[] = [];
    const first = recent[0];
    if (first) {
      const firstDow = parseUTCDate(first.date).getUTCDay();
      for (let i = 0; i < firstDow; i++) out.push(null);
    }
    out.push(...recent);
    return out;
  }, [recent]);

  const numWeeks = Math.ceil(cells.length / 7);

  // Month labels: place one when the month changes at the top of a column.
  const monthLabels = useMemo(() => {
    const labels: { col: number; text: string }[] = [];
    let lastMonth = -1;
    for (let col = 0; col < numWeeks; col++) {
      const cell = cells[col * 7];
      if (!cell) continue;
      const month = parseUTCDate(cell.date).getUTCMonth();
      if (month === lastMonth) continue;
      lastMonth = month;
      // Skip labels that would crowd the previous one (e.g. a partial first
      // column), so adjacent month names never overlap.
      const prev = labels[labels.length - 1];
      if (prev && col - prev.col < 3) continue;
      labels.push({ col, text: MONTHS[month] ?? "" });
    }
    return labels;
  }, [cells, numWeeks]);

  const showTip = useCallback((day: TCalendarDay, e: React.MouseEvent) => {
    setHover({ day, x: e.clientX, y: e.clientY });
  }, []);

  // The 365-cell grid depends only on the calendar and selection, never on
  // hover. Memoize it so continuous mouse-move (which updates the tooltip via
  // hover state) doesn't rebuild every cell element on each event.
  const cellEls = useMemo(
    () =>
      cells.map((d, i) => {
        const col = Math.floor(i / 7);
        const row = i % 7;
        const delay = (col + row) * 12;
        return d ? (
          <div
            key={d.date}
            className={`cell l${d.level}${
              selectedDate === d.date ? " sel" : ""
            }`}
            style={{
              cursor: onSelect ? "pointer" : "default",
              animationDelay: `${delay}ms`,
            }}
            onClick={() => onSelect?.(d.date)}
            onMouseEnter={(e) => showTip(d, e)}
            onMouseMove={(e) => showTip(d, e)}
            onMouseLeave={() => setHover(null)}
          />
        ) : (
          <div key={`pad-${i}`} className="cell pad" />
        );
      }),
    [cells, selectedDate, onSelect, showTip],
  );

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-stats">
        <span className="hm-stat">
          <strong>{streaks.total.toLocaleString()}</strong> contributions
        </span>
        <span className="hm-stat">
          <strong>{streaks.current}</strong> day current streak
        </span>
        <span className="hm-stat">
          <strong>{streaks.longest}</strong> day longest streak
        </span>
      </div>

      <div className="heatmap-scroll">
        <div
          className="heatmap-months"
          style={{
            gridTemplateColumns: `repeat(${numWeeks}, 12px)`,
          }}
        >
          {monthLabels.map((m) => (
            <span
              key={`${m.text}-${m.col}`}
              style={{ gridColumnStart: m.col + 1 }}
            >
              {m.text}
            </span>
          ))}
        </div>

        <div className="heatmap-body">
          <div className="heatmap-weekdays">
            {WEEKDAYS.map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>

          <div className="heatmap">{cellEls}</div>
        </div>
      </div>

      <div className="legend">
        <span>Less</span>
        <span className="cell l0" />
        <span className="cell l1" />
        <span className="cell l2" />
        <span className="cell l3" />
        <span className="cell l4" />
        <span>More</span>
      </div>

      {hover && (
        <div
          className="heatmap-tip"
          style={{ left: hover.x, top: hover.y }}
          role="tooltip"
        >
          <div className="tip-count">
            {hover.day.count} contribution
            {hover.day.count === 1 ? "" : "s"}
          </div>
          <div className="tip-date">
            {parseUTCDate(hover.day.date).toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}
          </div>
          <div className={`tip-bar l${hover.day.level}`} />
        </div>
      )}
    </div>
  );
});
