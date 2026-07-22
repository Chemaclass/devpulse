export type TBarDatum = {
  name: string;
  value: number;
  href?: string;
};

export function Bars({ data, max }: { data: TBarDatum[]; max?: number }) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars">
      {data.map((d) => (
        <div className="bar-row" key={d.name}>
          <span className="name" title={d.name}>
            {d.href ? (
              <a href={d.href} target="_blank" rel="noreferrer">
                {d.name}
              </a>
            ) : (
              d.name
            )}
          </span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${(d.value / top) * 100}%` }}
            />
          </span>
          <span className="count">{d.value}</span>
        </div>
      ))}
    </div>
  );
}
