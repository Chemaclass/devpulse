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
  Tooltip,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import {
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

export function DailyStackedChart({ byDay }: { byDay: DayStats[] }) {
  // oldest -> newest for the timeline
  const days = [...byDay].sort((a, b) => a.date.localeCompare(b.date));
  const labels = days.map((d) => d.date.slice(5));

  const data = {
    labels,
    datasets: CONTRIBUTION_TYPES.map((t) => ({
      label: TYPE_LABELS[t],
      data: days.map((d) => d[t]),
      backgroundColor: TYPE_COLORS[t],
      borderRadius: 3,
      stack: "s",
    })),
  };

  return (
    <Bar
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: tickColor, boxWidth: 12 } },
          tooltip: { mode: "index", intersect: false },
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
