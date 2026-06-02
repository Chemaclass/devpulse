import { ActivityEvent } from "../../core/types.js";

export function Feed({ events }: { events: ActivityEvent[] }) {
  if (!events.length) {
    return <p className="muted">No public activity in this view.</p>;
  }
  return (
    <div className="feed">
      {events.map((e) => (
        <div className="feed-item" key={e.id + e.title}>
          <span className={`dot t-${e.type}`} />
          <div className="body">
            <div className="title">
              <a href={e.url} target="_blank" rel="noreferrer">
                {e.title}
              </a>
            </div>
            <div className="meta">
              <span className="pill">{e.repo}</span>{" "}
              {new Date(e.datetime).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
