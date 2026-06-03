import { ActivityEvent, ContributionType } from "../../core/types.js";
import { Icon } from "./Icon.js";

const TYPE_META: Record<ContributionType, { icon: string; label: string }> = {
  commit: { icon: "⬆️", label: "Commit" },
  pullRequest: { icon: "🔀", label: "PR" },
  issue: { icon: "🐛", label: "Issue" },
  review: { icon: "👀", label: "Review" },
  other: { icon: "•", label: "Activity" },
};

export function Feed({ events }: { events: ActivityEvent[] }) {
  if (!events.length) {
    return <p className="muted">No public activity in this view.</p>;
  }
  return (
    <div className="feed">
      {events.map((e) => {
        const meta = TYPE_META[e.type];
        return (
          <div className="feed-item" key={e.id + e.title}>
            <span className={`feed-icon t-${e.type}`} title={meta.label}>
              <Icon glyph={meta.icon} label={meta.label} />
            </span>
            <div className="body">
              <div className="title">
                <a href={e.url} target="_blank" rel="noreferrer">
                  {e.title}
                </a>
              </div>
              <div className="meta">
                <span className={`type-tag t-${e.type}`}>{meta.label}</span>
                <a
                  className="pill"
                  href={e.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {e.repo}
                </a>
                <span className="when">
                  {new Date(e.datetime).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
