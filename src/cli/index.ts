#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getReport, parseUsername, GitHubError } from "../core/index.js";
import { toMarkdown } from "./markdown.js";

type TArgs = {
  user: string;
  out: string;
  json: boolean;
  md: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): TArgs {
  const args: TArgs = {
    user: "",
    out: "./out",
    json: true,
    md: true,
    help: false,
  };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "-u" || a === "--user") args.user = argv[++i] ?? "";
    else if (a === "-o" || a === "--out") args.out = argv[++i] ?? args.out;
    else if (a === "--json-only") args.md = false;
    else if (a === "--md-only") args.json = false;
    else if (!a.startsWith("-")) rest.push(a);
  }
  if (!args.user && rest.length) args.user = rest[0];
  return args;
}

const HELP = `
DevPulse — daily GitHub work report (public data, no token needed)

Usage:
  npm run report -- <username|profile-url> [options]

Options:
  -u, --user <name>   GitHub username or profile URL
  -o, --out <dir>     Output directory (default: ./out)
      --json-only     Only write report.json
      --md-only       Only write report.md
  -h, --help          Show this help

Environment:
  GITHUB_TOKEN        Optional PAT. Raises the rate limit and adds
                      per-repo commit history for the last year.

Examples:
  npm run report -- chemaclass
  npm run report -- https://github.com/chemaclass -o ./reports
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.user) {
    console.log(HELP);
    process.exit(args.user ? 0 : 1);
  }

  const username = parseUsername(args.user);
  // Optional: a token raises rate limits and unlocks per-repo year history.
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
  process.stdout.write(
    `Fetching ${token ? "" : "public "}GitHub activity for "${username}"… `,
  );

  let report;
  try {
    report = await getReport(username, fetch, token);
  } catch (err) {
    process.stdout.write("\n");
    if (err instanceof GitHubError && err.kind === "rate_limited") {
      console.error("✗ Rate limited by GitHub's public API. Try again in a bit.");
    } else {
      console.error(`✗ ${(err as Error).message}`);
    }
    process.exit(1);
  }
  console.log("done.");

  const outDir = resolve(process.cwd(), args.out);
  await mkdir(outDir, { recursive: true });

  const written: string[] = [];
  if (args.json) {
    const p = resolve(outDir, "report.json");
    await writeFile(p, JSON.stringify(report, null, 2), "utf8");
    written.push(p);
  }
  if (args.md) {
    const p = resolve(outDir, "report.md");
    await writeFile(p, toMarkdown(report), "utf8");
    written.push(p);
  }

  const c = report.calendar;
  console.log("");
  console.log(`  ${report.profile.name ?? username} (@${report.profile.login})`);
  console.log(`  All-time contributions: ${c.total.toLocaleString()}`);
  console.log(`  Current streak: ${c.currentStreak}d · Longest: ${c.longestStreak}d`);
  console.log(
    `  Recent (events): ${report.byType.commit} commits · ${report.byType.pullRequest} PRs · ${report.byType.issue} issues · ${report.byType.review} reviews`,
  );
  console.log("");
  for (const p of written) console.log(`  ✓ wrote ${p}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
