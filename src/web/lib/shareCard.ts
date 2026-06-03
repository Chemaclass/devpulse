import { Persona, Report } from "../../core/index.js";

// Renders a 1200x630 (OG-sized) summary card to a PNG and triggers a download.
// Pure canvas: no avatar fetch (avoids cross-origin taint), emoji via fillText.

const W = 1200;
const H = 630;

function stat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: string,
  label: string,
  accent: string,
) {
  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = "700 52px Georgia, serif";
  ctx.fillText(value, x, y);
  ctx.fillStyle = "#9aa489";
  ctx.font = "600 20px Inter, system-ui, sans-serif";
  ctx.fillText(label.toUpperCase(), x, y + 34);
}

export function downloadStatCard(report: Report, persona: Persona) {
  const { profile, calendar } = report;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Background.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0f1310");
  bg.addColorStop(1, "#1a241a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Accent glow blob.
  const glow = ctx.createRadialGradient(W - 200, 120, 0, W - 200, 120, 420);
  glow.addColorStop(0, "rgba(116,176,106,0.22)");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Wordmark.
  ctx.fillStyle = "#edefe3";
  ctx.font = "600 34px Georgia, serif";
  ctx.textAlign = "left";
  ctx.fillText("Dev⚡Pulse", 64, 86);

  // Persona.
  ctx.font = "90px serif";
  ctx.fillText(persona.emoji, 64, 230);
  ctx.fillStyle = "#9aa489";
  ctx.font = "600 24px Inter, system-ui, sans-serif";
  ctx.fillText(`@${profile.login} is`, 180, 178);
  ctx.fillStyle = "#74b06a";
  ctx.font = "700 64px Georgia, serif";
  ctx.fillText(persona.title, 180, 240);

  ctx.fillStyle = "#edefe3";
  ctx.font = "26px Inter, system-ui, sans-serif";
  ctx.fillText(persona.tagline, 64, 320);

  // Stats row.
  const y = 470;
  stat(ctx, 64, y, calendar.total.toLocaleString(), "Contributions", "#74b06a");
  stat(ctx, 380, y, `${calendar.currentStreak}d`, "Current streak", "#e3b341");
  stat(ctx, 660, y, calendar.activeDays.toLocaleString(), "Active days", "#6f8fb0");
  stat(
    ctx,
    940,
    y,
    String(calendar.bestDay?.count ?? 0),
    "Best day",
    "#d8825c",
  );

  // Footer.
  ctx.fillStyle = "#9aa489";
  ctx.font = "20px Inter, system-ui, sans-serif";
  ctx.fillText("chemaclass.github.io/devpulse", 64, H - 44);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${profile.login}-devpulse.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
