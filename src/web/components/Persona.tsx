import { Persona as TPersona } from "../../core/index.js";
import { Icon } from "./Icon.js";

interface Props {
  persona: TPersona;
  login: string;
}

export function Persona({ persona, login }: Props) {
  return (
    <div className={`persona ${persona.accent}`}>
      <div className="persona-head">
        <span className="persona-emoji">
          <Icon glyph={persona.emoji} label={persona.title} />
        </span>
        <div>
          <div className="persona-kicker">@{login} is</div>
          <h3 className="persona-title">{persona.title}</h3>
          <p className="persona-tagline">{persona.tagline}</p>
        </div>
      </div>
      {persona.traits.length > 0 && (
        <div className="persona-traits">
          {persona.traits.map((t, i) => (
            <div className="persona-trait" key={i}>
              <span className="pt-icon">
                <Icon glyph={t.icon} />
              </span>
              <div>
                <div className="pt-label">{t.label}</div>
                <div className="pt-value">{t.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
