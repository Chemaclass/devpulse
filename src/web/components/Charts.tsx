import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, PolarArea, Radar } from "react-chartjs-2";
import {
  ActivityEvent,
  CalendarDay,
  CONTRIBUTION_TYPES,
  ContributionType,
  DayStats,
} from "../../core/types.js";

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

const TYPE_COLORS: Record<ContributionType, string> = {
  commit: "#74b06a", // leaf green
  pullRequest: "#6f8fb0", // dusk sky
  issue: "#e3b341", // golden hour
  review: "#5aa17a", // sage
  other: "#9aa489", // muted moss
};

const TYPE_LABELS: Record<ContributionType, string> = {
  commit: "Commits",
  pullRequest: "Pull requests",
  issue: "Issues",
  review: "Reviews",
  other: "Other",
};

const tickColor = "#9aa489";
const gridColor = "rgba(150,165,120,0.1)";

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
  byDay: DayStats[];
  days: CalendarDay[];
  lookback?: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
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
  byType: Record<ContributionType, number>;
}) {
  const entries = CONTRIBUTION_TYPES.filter((t) => byType[t] > 0);
  const data = {
    labels: entries.map((t) => TYPE_LABELS[t]),
    datasets: [
      {
        data: entries.map((t) => byType[t]),
        backgroundColor: entries.map((t) => TYPE_COLORS[t]),
        borderColor: "rgba(5,6,12,0.6)",
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
        scales: {
          x: { ticks: { color: tickColor }, grid: { display: false } },
          y: { ticks: { color: tickColor, precision: 0 }, grid: { color: gridColor } },
        },
      }}
    />
  );
}

export function TypeRadar({
  byType,
}: {
  byType: Record<ContributionType, number>;
}) {
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
        scales: {
          r: {
            angleLines: { color: gridColor },
            grid: { color: gridColor },
            pointLabels: { color: tickColor, font: { size: 12 } },
            ticks: { display: false, precision: 0 },
          },
        },
      }}
    />
  );
}

const HOUR_COLORS = (() => {
  // Cool at night, warm by day — a sun cycle.
  const arr: string[] = [];
  for (let h = 0; h < 24; h++) {
    const day = h >= 6 && h < 18;
    arr.push(day ? "rgba(227,179,65,0.65)" : "rgba(111,143,176,0.6)");
  }
  return arr;
})();

export function CodingClock({ events }: { events: ActivityEvent[] }) {
  const buckets = new Array(24).fill(0);
  for (const e of events) {
    const h = new Date(e.datetime).getUTCHours();
    if (!Number.isNaN(h)) buckets[h] += Math.max(1, e.weight);
  }
  const data = {
    labels: buckets.map((_, h) => `${h}:00`),
    datasets: [
      {
        data: buckets,
        backgroundColor: HOUR_COLORS,
        borderWidth: 0,
      },
    ],
  };
  return (
    <PolarArea
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { title: (i) => `${i[0].label} UTC` } },
        },
        scales: {
          r: {
            grid: { color: gridColor },
            angleLines: { color: gridColor },
            ticks: { display: false },
            pointLabels: { display: false },
          },
        },
      }}
    />
  );
}
