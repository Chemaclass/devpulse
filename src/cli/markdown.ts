import { derivePersona } from "../core/persona.js";
import { Report } from "../core/types.js";

function bar(value: number, max: number, width = 24): string {
  if (max <= 0) return "";
  const filled = Math.round((value / max) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export function toMarkdown(report: Report): string {
  const { profile, calendar, byDay, byRepo, byType, window } = report;
  const lines: string[] = [];

  lines.push(`# DevPulse — GitHub work report`);
  lines.push("");
  lines.push(
    `**${profile.name ?? profile.login}** ([@${profile.login}](${profile.htmlUrl}))`,
  );
  if (profile.bio) lines.push(`> ${profile.bio}`);
  lines.push("");
  lines.push(`_Generated ${report.generatedAt}_`);
  lines.push("");

  const persona = derivePersona(report);
  lines.push(`## ${persona.emoji} ${persona.title}`);
  lines.push("");
  lines.push(`_${persona.tagline}_`);
  lines.push("");
  for (const t of persona.traits) {
    lines.push(`- ${t.icon} **${t.label}:** ${t.value}`);
  }
  lines.push("");

  lines.push(`## All-time contributions`);
  lines.push("");
  lines.push(`- **Total contributions:** ${calendar.total.toLocaleString()}`);
  lines.push(`- **Active days:** ${calendar.activeDays.toLocaleString()}`);
  lines.push(
    `- **Avg per active day:** ${calendar.averagePerActiveDay.toFixed(1)}`,
  );
  lines.push(`- **Current streak:** ${calendar.currentStreak} days`);
  lines.push(`- **Longest streak:** ${calendar.longestStreak} days`);
  if (calendar.bestDay) {
    lines.push(
      `- **Best day:** ${calendar.bestDay.date} (${calendar.bestDay.count} contributions)`,
    );
  }
  lines.push("");

  const years = Object.keys(calendar.totalByYear).sort().reverse();
  if (years.length) {
    lines.push(`### By year`);
    lines.push("");
    lines.push(`| Year | Contributions |`);
    lines.push(`| --- | ---: |`);
    for (const y of years) {
      lines.push(`| ${y} | ${calendar.totalByYear[y].toLocaleString()} |`);
    }
    lines.push("");
  }

  lines.push(`## Recent detailed activity`);
  lines.push("");
  lines.push(
    window.from
      ? `Window: **${window.from} → ${window.to}** (${window.days} days, public events).`
      : `No recent public events found.`,
  );
  lines.push("");
  lines.push(`### Breakdown by type`);
  lines.push("");
  lines.push(`| Type | Count |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| Commits | ${byType.commit} |`);
  lines.push(`| Pull requests | ${byType.pullRequest} |`);
  lines.push(`| Issues | ${byType.issue} |`);
  lines.push(`| Reviews | ${byType.review} |`);
  lines.push(`| Other | ${byType.other} |`);
  lines.push("");

  if (byRepo.length) {
    const max = byRepo[0].total;
    lines.push(`### Top projects`);
    lines.push("");
    lines.push(`| Project | Commits | PRs | Issues | Reviews | Total | |`);
    lines.push(`| --- | ---: | ---: | ---: | ---: | ---: | :-- |`);
    for (const r of byRepo.slice(0, 15)) {
      lines.push(
        `| [${r.repo}](${r.repoUrl}) | ${r.commit} | ${r.pullRequest} | ${r.issue} | ${r.review} | **${r.total}** | \`${bar(
          r.total,
          max,
          12,
        )}\` |`,
      );
    }
    lines.push("");
  }

  if (report.yearStats) {
    const ys = report.yearStats;
    lines.push(`### Last year (via token)`);
    lines.push("");
    lines.push(
      `Commits ${ys.byType.commit} · PRs ${ys.byType.pullRequest} · Issues ${ys.byType.issue} · Reviews ${ys.byType.review}`,
    );
    lines.push("");
    if (ys.topRepos.length) {
      lines.push(`| Top repository (last year) | Contributions |`);
      lines.push(`| --- | ---: |`);
      for (const r of ys.topRepos.slice(0, 15)) {
        lines.push(`| [${r.repo}](${r.repoUrl}) | ${r.total} |`);
      }
      lines.push("");
    }
  }

  if (report.languages.length) {
    lines.push(`### Top languages`);
    lines.push("");
    lines.push(`| Language | Repos | Stars |`);
    lines.push(`| --- | ---: | ---: |`);
    for (const l of report.languages.slice(0, 12)) {
      lines.push(`| ${l.language} | ${l.repos} | ${l.stars} |`);
    }
    lines.push("");
  }

  if (byDay.length) {
    lines.push(`### Day by day`);
    lines.push("");
    lines.push(`| Date | Commits | PRs | Issues | Reviews | Total | Projects |`);
    lines.push(`| --- | ---: | ---: | ---: | ---: | ---: | --- |`);
    for (const d of byDay) {
      lines.push(
        `| ${d.date} | ${d.commit} | ${d.pullRequest} | ${d.issue} | ${d.review} | **${d.total}** | ${d.repos
          .map((r) => r.split("/")[1] ?? r)
          .join(", ")} |`,
      );
    }
    lines.push("");
  }

  if (report.notes.length) {
    lines.push(`---`);
    lines.push("");
    for (const n of report.notes) lines.push(`> ℹ️ ${n}`);
    lines.push("");
  }

  return lines.join("\n");
}
