import { ImageResponse } from "workers-og";

type TEnv = {
  SITE: string;
}

// ---- Minimal public-data fetch (mirrors src/core, kept tiny + dependency-free) ----

type TCardData = {
  login: string;
  name: string;
  emoji: string;
  title: string;
  total: number;
  currentStreak: number;
  bestDay: number;
}

const ARCHETYPES = {
  quiet: { emoji: "🌱", title: "The Quiet Builder" },
  guardian: { emoji: "🛡️", title: "The Guardian" },
  shipper: { emoji: "🚀", title: "The Shipper" },
  planner: { emoji: "🗺️", title: "The Planner" },
  machine: { emoji: "🔨", title: "The Machine" },
  allrounder: { emoji: "🎛️", title: "The All-Rounder" },
};

function archetype(t: Record<string, number>, total: number) {
  if (total === 0) return ARCHETYPES.quiet;
  const s = (k: string) => (t[k] ?? 0) / total;
  if (s("review") >= 0.2 && s("review") >= s("pr") && s("review") >= s("issue"))
    return ARCHETYPES.guardian;
  if (s("pr") >= 0.35 && s("pr") >= s("commit")) return ARCHETYPES.shipper;
  if (s("issue") >= 0.3 && s("issue") >= s("commit")) return ARCHETYPES.planner;
  if (s("commit") >= 0.6) return ARCHETYPES.machine;
  return ARCHETYPES.allrounder;
}

async function loadCard(login: string): Promise<TCardData | null> {
  const gh = { "User-Agent": "DevPulse-OG", Accept: "application/vnd.github+json" };
  const [profileRes, calRes, eventsRes] = await Promise.all([
    fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, { headers: gh }),
    fetch(`https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(login)}?y=all`),
    fetch(`https://api.github.com/users/${encodeURIComponent(login)}/events/public?per_page=100`, {
      headers: gh,
    }),
  ]);
  if (!profileRes.ok || !calRes.ok) return null;

  const profile = (await profileRes.json()) as { login: string; name?: string };
  const cal = (await calRes.json()) as {
    contributions: { date: string; count: number }[];
  };
  const days = (cal.contributions ?? []).sort((a, b) => a.date.localeCompare(b.date));
  const today = new Date().toISOString().slice(0, 10);

  let total = 0;
  let bestDay = 0;
  for (const d of days) {
    total += d.count;
    if (d.count > bestDay) bestDay = d.count;
  }
  let currentStreak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (d.count > 0) currentStreak++;
    else if (d.date >= today) continue;
    else break;
  }

  // Archetype from recent events.
  const byType: Record<string, number> = {};
  if (eventsRes.ok) {
    const events = (await eventsRes.json()) as {
      type: string;
      payload?: { action?: string };
    }[];
    if (Array.isArray(events)) {
      for (const e of events) {
        if (e.type === "PushEvent") byType.commit = (byType.commit ?? 0) + 1;
        else if (e.type === "PullRequestEvent" && e.payload?.action === "opened")
          byType.pr = (byType.pr ?? 0) + 1;
        else if (e.type === "IssuesEvent" && e.payload?.action === "opened")
          byType.issue = (byType.issue ?? 0) + 1;
        else if (e.type?.startsWith("PullRequestReview"))
          byType.review = (byType.review ?? 0) + 1;
      }
    }
  }
  const arch = archetype(byType, Object.values(byType).reduce((a, b) => a + b, 0));

  return {
    login: profile.login,
    name: profile.name ?? profile.login,
    emoji: arch.emoji,
    title: arch.title,
    total,
    currentStreak,
    bestDay,
  };
}

// ---- Image ----

function ogImage(d: TCardData) {
  const stat = (value: string, label: string, color: string) => `
    <div style="display:flex;flex-direction:column;">
      <span style="font-size:54px;font-weight:700;color:${color};">${value}</span>
      <span style="font-size:20px;color:#9aa489;letter-spacing:2px;">${label}</span>
    </div>`;
  return `
  <div style="display:flex;flex-direction:column;width:1200px;height:630px;padding:64px;
    background:linear-gradient(135deg,#0f1310,#1a241a);color:#edefe3;font-family:sans-serif;">
    <div style="font-size:34px;font-weight:700;">Dev⚡Pulse</div>
    <div style="display:flex;align-items:center;margin-top:40px;">
      <span style="font-size:120px;margin-right:32px;">${d.emoji}</span>
      <div style="display:flex;flex-direction:column;">
        <span style="font-size:24px;color:#9aa489;">@${d.login} is</span>
        <span style="font-size:72px;font-weight:700;color:#74b06a;">${d.title}</span>
      </div>
    </div>
    <div style="display:flex;gap:80px;margin-top:auto;">
      ${stat(d.total.toLocaleString(), "CONTRIBUTIONS", "#74b06a")}
      ${stat(d.currentStreak + "d", "CURRENT STREAK", "#e3b341")}
      ${stat(String(d.bestDay), "BEST DAY", "#d8825c")}
    </div>
    <div style="font-size:20px;color:#9aa489;margin-top:32px;">chemaclass.github.io/devpulse</div>
  </div>`;
}

// ---- Worker ----

export default {
  async fetch(request: Request, env: TEnv): Promise<Response> {
    const url = new URL(request.url);

    // 1) The image endpoint: /og?u=<login>
    if (url.pathname.endsWith("/og")) {
      const login = url.searchParams.get("u");
      const data = login ? await loadCard(login) : null;
      if (!data) return new Response("Not found", { status: 404 });
      return new ImageResponse(ogImage(data), {
        width: 1200,
        height: 630,
        headers: { "Cache-Control": "public, max-age=3600" },
      });
    }

    // 2) Everything else: proxy the static site, injecting per-user meta when ?u= is set.
    const upstream = await fetch(env.SITE + url.pathname + url.search, request);
    const login = url.searchParams.get("u");
    if (!login || !upstream.headers.get("content-type")?.includes("text/html")) {
      return upstream;
    }

    const handle = encodeURIComponent(login);
    const title = `${login} · DevPulse`;
    const description = `See how @${login} works on GitHub: contribution heatmap, streaks, developer archetype, top projects and recent activity. Public data, no login.`;
    const canonical = `${url.origin}${url.pathname}?u=${handle}`;
    const image = `${url.origin}/og?u=${handle}`;
    const setContent = (value: string) => ({
      element: (e: { setAttribute: (k: string, v: string) => void }) =>
        e.setAttribute("content", value),
    });
    return new HTMLRewriter()
      .on("title", { element: (e) => e.setInnerContent(title) })
      .on('meta[name="description"]', setContent(description))
      .on('meta[property="og:title"]', setContent(title))
      .on('meta[property="og:description"]', setContent(description))
      .on('meta[property="og:url"]', setContent(canonical))
      .on('meta[name="twitter:title"]', setContent(title))
      .on('meta[name="twitter:description"]', setContent(description))
      .on('meta[name="twitter:card"]', setContent("summary_large_image"))
      .on('link[rel="canonical"]', {
        element: (e) => e.setAttribute("href", canonical),
      })
      .on("head", {
        element: (e) =>
          e.append(
            `<meta property="og:image" content="${image}" /><meta name="twitter:image" content="${image}" />`,
            { html: true },
          ),
      })
      .transform(upstream);
  },
};
