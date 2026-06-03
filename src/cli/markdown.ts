import { derivePersona } from "../core/persona.js";
import {
  TCalendarSummary,
  TContributionType,
  TDayStats,
  TLanguageStat,
  TReport,
  TRepoStats,
  TYearStats,
} from "../core/types.js";

// How many rows each ranked table shows before truncating.
const TOP_PROJECTS = 15;
const TOP_YEAR_REPOS = 15;
const TOP_LANGUAGES = 12;

function bar(value: number, max: number, width = 24): string {
  if (max <= 0) return "";
  const filled = Math.round((value / max) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function headerSection(report: TReport): string[] {
  const { profile } = report;
  const lines = [
    `# DevPulse — GitHub work report`,
    "",
    `**${profile.name ?? profile.login}** ([@${profile.login}](${profile.htmlUrl}))`,
  ];
  if (profile.bio) lines.push(`> ${profile.bio}`);
  lines.push("", `_Generated ${report.generatedAt}_`, "");
  return lines;
}

function personaSection(report: TReport): string[] {
  const persona = derivePersona(report);
  const lines = [`## ${persona.emoji} ${persona.title}`, "", `_${persona.tagline}_`, ""];
  for (const t of persona.traits) {
    lines.push(`- ${t.icon} **${t.label}:** ${t.value}`);
  }
  lines.push("");
  return lines;
}

function allTimeSection(calendar: TCalendarSummary): string[] {
  const lines = [
    `## All-time contributions`,
    "",
    `- **Total contributions:** ${calendar.total.toLocaleString()}`,
    `- **Active days:** ${calendar.activeDays.toLocaleString()}`,
    `- **Avg per active day:** ${calendar.averagePerActiveDay.toFixed(1)}`,
    `- **Current streak:** ${calendar.currentStreak} days`,
    `- **Longest streak:** ${calendar.longestStreak} days`,
  ];
  if (calendar.bestDay) {
    lines.push(
      `- **Best day:** ${calendar.bestDay.date} (${calendar.bestDay.count} contributions)`,
    );
  }
  lines.push("");
  return lines;
}

function byYearSection(calendar: TCalendarSummary): string[] {
  const years = Object.keys(calendar.totalByYear).sort().reverse();
  if (!years.length) return [];
  const lines = [`### By year`, "", `| Year | Contributions |`, `| --- | ---: |`];
  for (const y of years) {
    lines.push(`| ${y} | ${calendar.totalByYear[y].toLocaleString()} |`);
  }
  lines.push("");
  return lines;
}

function breakdownByTypeSection(
  window: TReport["window"],
  byType: Record<TContributionType, number>,
): string[] {
  return [
    `## Recent detailed activity`,
    "",
    window.from
      ? `Window: **${window.from} → ${window.to}** (${window.days} days, public events).`
      : `No recent public events found.`,
    "",
    `### Breakdown by type`,
    "",
    `| Type | Count |`,
    `| --- | ---: |`,
    `| Commits | ${byType.commit} |`,
    `| Pull requests | ${byType.pullRequest} |`,
    `| Issues | ${byType.issue} |`,
    `| Reviews | ${byType.review} |`,
    `| Other | ${byType.other} |`,
    "",
  ];
}

function topProjectsSection(byRepo: TRepoStats[]): string[] {
  if (!byRepo.length) return [];
  const max = byRepo[0].total;
  const lines = [
    `### Top projects`,
    "",
    `| Project | Commits | PRs | Issues | Reviews | Total | |`,
    `| --- | ---: | ---: | ---: | ---: | ---: | :-- |`,
  ];
  for (const r of byRepo.slice(0, TOP_PROJECTS)) {
    lines.push(
      `| [${r.repo}](${r.repoUrl}) | ${r.commit} | ${r.pullRequest} | ${r.issue} | ${r.review} | **${r.total}** | \`${bar(
        r.total,
        max,
        12,
      )}\` |`,
    );
  }
  lines.push("");
  return lines;
}

function lastYearSection(yearStats: TYearStats | undefined): string[] {
  if (!yearStats) return [];
  const lines = [
    `### Last year (via token)`,
    "",
    `Commits ${yearStats.byType.commit} · PRs ${yearStats.byType.pullRequest} · Issues ${yearStats.byType.issue} · Reviews ${yearStats.byType.review}`,
    "",
  ];
  if (yearStats.topRepos.length) {
    lines.push(`| Top repository (last year) | Contributions |`, `| --- | ---: |`);
    for (const r of yearStats.topRepos.slice(0, TOP_YEAR_REPOS)) {
      lines.push(`| [${r.repo}](${r.repoUrl}) | ${r.total} |`);
    }
    lines.push("");
  }
  return lines;
}

function topLanguagesSection(languages: TLanguageStat[]): string[] {
  if (!languages.length) return [];
  const lines = [
    `### Top languages`,
    "",
    `| Language | Repos | Stars |`,
    `| --- | ---: | ---: |`,
  ];
  for (const l of languages.slice(0, TOP_LANGUAGES)) {
    lines.push(`| ${l.language} | ${l.repos} | ${l.stars} |`);
  }
  lines.push("");
  return lines;
}

function dayByDaySection(byDay: TDayStats[]): string[] {
  if (!byDay.length) return [];
  const lines = [
    `### Day by day`,
    "",
    `| Date | Commits | PRs | Issues | Reviews | Total | Projects |`,
    `| --- | ---: | ---: | ---: | ---: | ---: | --- |`,
  ];
  for (const d of byDay) {
    lines.push(
      `| ${d.date} | ${d.commit} | ${d.pullRequest} | ${d.issue} | ${d.review} | **${d.total}** | ${d.repos
        .map((r) => r.split("/")[1] ?? r)
        .join(", ")} |`,
    );
  }
  lines.push("");
  return lines;
}

function notesSection(notes: string[]): string[] {
  if (!notes.length) return [];
  const lines = [`---`, ""];
  for (const n of notes) lines.push(`> ℹ️ ${n}`);
  lines.push("");
  return lines;
}

export function toMarkdown(report: TReport): string {
  const { calendar, byDay, byRepo, byType, window } = report;
  return [
    ...headerSection(report),
    ...personaSection(report),
    ...allTimeSection(calendar),
    ...byYearSection(calendar),
    ...breakdownByTypeSection(window, byType),
    ...topProjectsSection(byRepo),
    ...lastYearSection(report.yearStats),
    ...topLanguagesSection(report.languages),
    ...dayByDaySection(byDay),
    ...notesSection(report.notes),
  ].join("\n");
}
