import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  ChartOptions,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Radar } from "react-chartjs-2";
import { weekdayBuckets } from "../../core/contributions.js";
import { todayISO } from "../../core/dates.js";
import {
  TCalendarDay,
  CONTRIBUTION_TYPES,
  TContributionType,
  TDayStats,
} from "../../core/types.js";
import { useTheme } from "../theme.js";

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  Filler,
  Legend,
  Tooltip,
);

const TYPE_COLORS: Record<TContributionType, string> = {
  commit: "#74b06a", // leaf green
  pullRequest: "#6f8fb0", // dusk sky
  issue: "#e3b341", // golden hour
  review: "#5aa17a", // sage
  other: "#9aa489", // muted moss
};

const TYPE_LABELS: Record<TContributionType, string> = {
  commit: "Commits",
  pullRequest: "Pull requests",
  issue: "Issues",
  review: "Reviews",
  other: "Other",
};

// Chart text/grid colors follow the active theme (and re-render on toggle).
function useChartColors() {
  const { theme } = useTheme();
  return theme === "dark"
    ? {
        tickColor: "#9aa489",
        gridColor: "rgba(150,165,120,0.12)",
        sliceBorder: "rgba(15,19,16,0.6)",
      }
    : {
        tickColor: "#5f6b50",
        gridColor: "rgba(70,90,50,0.14)",
        sliceBorder: "rgba(255,255,255,0.75)",
      };
}

// Shared x/y scale styling for the simple (non-stacked) bar charts.
function barScales(
  tickColor: string,
  gridColor: string,
): ChartOptions<"bar">["scales"] {
  return {
    x: { ticks: { color: tickColor }, grid: { display: false } },
    y: { ticks: { color: tickColor, precision: 0 }, grid: { color: gridColor } },
  };
}

// Shared radial scale styling for the personality radars.
function radarScales(
  tickColor: string,
  gridColor: string,
): ChartOptions<"radar">["scales"] {
  return {
    r: {
      angleLines: { color: gridColor },
      grid: { color: gridColor },
      pointLabels: { color: tickColor, font: { size: 12 } },
      ticks: { display: false, precision: 0 },
    },
  };
}

const CALENDAR_COLOR = "rgba(150,165,120,0.35)";
const DEFAULT_DAYS = 30;

/**
 * Daily contributions over the last `lookback` calendar days. The events feed
 * is capped (~300 events) and can cover only a day or two for very active
 * users, so we anchor the timeline to the contribution calendar (accurate for
 * everyone) and overlay the per-type breakdown wherever the events feed
 * reaches. Days only known to the calendar render as a neutral block.
 */
export function DailyChart({
  byDay,
  days,
  lookback = DEFAULT_DAYS,
}: {
  byDay: TDayStats[];
  days: TCalendarDay[];
  lookback?: number;
}) {
  const { tickColor, gridColor } = useChartColors();
  const today = todayISO();
  const window = days
    .filter((d) => d.date <= today)
    .slice(-lookback);
  const byDate = new Map(byDay.map((d) => [d.date, d]));

  const labels = window.map((d) => d.date.slice(5));

  const typeDatasets = CONTRIBUTION_TYPES.map((t) => ({
    label: TYPE_LABELS[t],
    data: window.map((d) => byDate.get(d.date)?.[t] ?? 0),
    backgroundColor: TYPE_COLORS[t],
    borderRadius: 2,
    stack: "s",
  }));

  // Per day, contributions on the calendar not captured by the events feed.
  const calendarRemainder = window.map((d) => {
    const detail = byDate.get(d.date);
    const tracked = detail
      ? CONTRIBUTION_TYPES.reduce((s, t) => s + detail[t], 0)
      : 0;
    return Math.max(0, d.count - tracked);
  });

  const data = {
    labels,
    datasets: [
      ...typeDatasets,
      {
        label: "Calendar",
        data: calendarRemainder,
        backgroundColor: CALENDAR_COLOR,
        borderRadius: 2,
        stack: "s",
      },
    ],
  };

  return (
    <Bar
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: tickColor, boxWidth: 12 } },
          tooltip: {
            mode: "index",
            intersect: false,
            // Only show series that actually contributed that day.
            filter: (item) => (item.parsed.y ?? 0) > 0,
            itemSort: (x, y) => (y.parsed.y ?? 0) - (x.parsed.y ?? 0),
          },
        },
        scales: {
          x: {
            stacked: true,
            ticks: { color: tickColor, maxRotation: 0, autoSkip: true },
            grid: { display: false },
          },
          y: {
            stacked: true,
            ticks: { color: tickColor, precision: 0 },
            grid: { color: gridColor },
          },
        },
      }}
    />
  );
}

export function TypeDoughnut({
  byType,
}: {
  byType: Record<TContributionType, number>;
}) {
  const { tickColor, sliceBorder } = useChartColors();
  const entries = CONTRIBUTION_TYPES.filter((t) => byType[t] > 0);
  const data = {
    labels: entries.map((t) => TYPE_LABELS[t]),
    datasets: [
      {
        data: entries.map((t) => byType[t]),
        backgroundColor: entries.map((t) => TYPE_COLORS[t]),
        borderColor: sliceBorder,
        borderWidth: 2,
        hoverOffset: 8,
      },
    ],
  };
  return (
    <Doughnut
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { position: "bottom", labels: { color: tickColor, boxWidth: 12 } },
        },
      }}
    />
  );
}

export function YearBars({
  totalByYear,
}: {
  totalByYear: Record<string, number>;
}) {
  const { tickColor, gridColor } = useChartColors();
  const years = Object.keys(totalByYear).sort();
  const data = {
    labels: years,
    datasets: [
      {
        label: "Contributions",
        data: years.map((y) => totalByYear[y]),
        backgroundColor: TYPE_COLORS.commit,
        borderRadius: 4,
      },
    ],
  };
  return (
    <Bar
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: barScales(tickColor, gridColor),
      }}
    />
  );
}

export function TypeRadar({
  byType,
}: {
  byType: Record<TContributionType, number>;
}) {
  const { tickColor, gridColor } = useChartColors();
  const data = {
    labels: CONTRIBUTION_TYPES.map((t) => TYPE_LABELS[t]),
    datasets: [
      {
        label: "Recent mix",
        data: CONTRIBUTION_TYPES.map((t) => byType[t]),
        backgroundColor: "rgba(116,176,106,0.25)",
        borderColor: TYPE_COLORS.commit,
        borderWidth: 2,
        pointBackgroundColor: TYPE_COLORS.commit,
      },
    ],
  };
  return (
    <Radar
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: radarScales(tickColor, gridColor),
      }}
    />
  );
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Monday-first display order.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * Contributions by weekday across the whole calendar (count-weighted).
 * Uses the calendar (accurate for everyone) rather than the sparse events
 * feed, with weekends tinted amber.
 */
export function WeekdayBars({ days }: { days: TCalendarDay[] }) {
  const { tickColor, gridColor } = useChartColors();
  const buckets = weekdayBuckets(days);
  const data = {
    labels: WEEK_ORDER.map((i) => WEEKDAY_SHORT[i]),
    datasets: [
      {
        label: "Contributions",
        data: WEEK_ORDER.map((i) => buckets[i]),
        backgroundColor: WEEK_ORDER.map((i) =>
          i === 0 || i === 6 ? "#e3b341" : TYPE_COLORS.commit,
        ),
        borderRadius: 4,
      },
    ],
  };
  return (
    <Bar
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: barScales(tickColor, gridColor),
      }}
    />
  );
}

type TRadarSeries = {
  label: string;
  byType: Record<TContributionType, number>;
  color: string;
  fill: string;
}

export function TypeRadarCompare({ a, b }: { a: TRadarSeries; b: TRadarSeries }) {
  const { tickColor, gridColor } = useChartColors();
  const series = [a, b];
  const data = {
    labels: CONTRIBUTION_TYPES.map((t) => TYPE_LABELS[t]),
    datasets: series.map((s) => ({
      label: s.label,
      data: CONTRIBUTION_TYPES.map((t) => s.byType[t]),
      backgroundColor: s.fill,
      borderColor: s.color,
      borderWidth: 2,
      pointBackgroundColor: s.color,
    })),
  };
  return (
    <Radar
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: tickColor, boxWidth: 12 } } },
        scales: radarScales(tickColor, gridColor),
      }}
    />
  );
}

type TYearSeries = {
  label: string;
  totalByYear: Record<string, number>;
  color: string;
}

export function YearBarsCompare({ a, b }: { a: TYearSeries; b: TYearSeries }) {
  const { tickColor, gridColor } = useChartColors();
  const years = Array.from(
    new Set([...Object.keys(a.totalByYear), ...Object.keys(b.totalByYear)]),
  ).sort();
  const data = {
    labels: years,
    datasets: [a, b].map((s) => ({
      label: s.label,
      data: years.map((y) => s.totalByYear[y] ?? 0),
      backgroundColor: s.color,
      borderRadius: 3,
    })),
  };
  return (
    <Bar
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: tickColor, boxWidth: 12 } } },
        scales: barScales(tickColor, gridColor),
      }}
    />
  );
}
