import { useEffect } from "react";
import { Icon } from "./Icons";
import { scoreTone } from "./lib";
import { useTheme } from "./theme";

/* Shared building blocks used by every portal. */

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const dark = theme === "dark";
  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button type="button" className="icon-btn theme-toggle" onClick={toggle} aria-label={label} title={label}>
      <Icon name={dark ? "sun" : "moon"} size={17} />
    </button>
  );
}

export function Brand({ subtitle = "Interview coaching" }) {
  return (
    <div className="brand">
      <span className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="20" height="20">
          <path d="M9 7h14M9 25h14M16 7v18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <circle cx="24.5" cy="16" r="2.4" fill="currentColor" />
        </svg>
      </span>
      <span className="brand__text">
        <strong>Intervo</strong>
        <small>{subtitle}</small>
      </span>
    </div>
  );
}

export function ScoreRing({ value = 0, size = 120, stroke = 10, label, tone }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const empty = value === null || value === undefined;
  const safe = empty ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className={`ring ring--${tone || scoreTone(safe)}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        {!empty && safe > 0 && (
          <circle className="ring__value" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c - (safe / 100) * c} />
        )}
      </svg>
      <div className="ring__label">
        <strong>{empty ? "—" : safe}</strong>
        {label && <span>{label}</span>}
      </div>
    </div>
  );
}

export function Sparkline({ values, width = 84, height = 26 }) {
  if (!values || values.length < 2) return <span className="sparkline sparkline--empty">—</span>;
  const min = Math.min(...values, 30);
  const max = Math.max(...values, 100);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 6) + 3, height - 3 - ((v - min) / (max - min || 1)) * (height - 6)]);
  const last = pts[pts.length - 1];
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pts.map((p) => p.join(",")).join(" ")} />
      <circle cx={last[0]} cy={last[1]} r="2.6" />
    </svg>
  );
}

/** Session score line chart with a threshold line. */
export function LineChart({ points, threshold = 60, height = 190 }) {
  const width = 640;
  const pad = { l: 34, r: 14, t: 14, b: 26 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (i) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v) => pad.t + ih - (v / 100) * ih;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${pad.t + ih} L${x(0)},${pad.t + ih} Z`;
  return (
    <svg className="linechart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Session scores over time">
      <defs>
        <linearGradient id="lc-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--brand)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line className="linechart__grid" x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} />
          <text className="linechart__axis" x={pad.l - 8} y={y(v) + 4} textAnchor="end">{v}</text>
        </g>
      ))}
      <line className="linechart__threshold" x1={pad.l} x2={width - pad.r} y1={y(threshold)} y2={y(threshold)} />
      <text className="linechart__threshold-label" x={width - pad.r} y={y(threshold) - 6} textAnchor="end">weakness threshold {threshold}%</text>
      <path className="linechart__area" d={area} fill="url(#lc-fill)" />
      <path className="linechart__line" d={line} />
      {points.map((p, i) => (
        <g key={i} className="linechart__pt">
          <circle cx={x(i)} cy={y(p.value)} r="4.5" />
          <text x={x(i)} y={height - 6} textAnchor="middle" className="linechart__axis">{p.label}</text>
          <title>{`${p.label}: ${p.value}%`}</title>
        </g>
      ))}
    </svg>
  );
}

export function Meter({ value, tone }) {
  return (
    <div className={`meter meter--${tone || scoreTone(value)}`} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
    </div>
  );
}

export function PageHeader({ kicker, title, subtitle, actions }) {
  return (
    <header className="page-header">
      <div>
        {kicker && <p className="kicker">{kicker}</p>}
        <h1>{title}</h1>
        {subtitle && <p className="page-header__sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

export function Card({ title, subtitle, action, className = "", children }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card__head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, icon, accent = "blue" }) {
  return (
    <article className={`stat stat--${accent}`}>
      <div className="stat__top">
        <span>{label}</span>
        <span className="stat__icon"><Icon name={icon} size={17} /></span>
      </div>
      <strong className="stat__value">{value}</strong>
      <span className="stat__hint">{hint}</span>
    </article>
  );
}

export function Empty({ icon, title, text, action, onAction }) {
  return (
    <div className="empty">
      <span className="empty__icon"><Icon name={icon} size={22} /></span>
      <strong>{title}</strong>
      <p>{text}</p>
      {action && (
        <button className="btn btn--ghost" onClick={onAction}>
          {action} <Icon name="arrowRight" size={15} />
        </button>
      )}
    </div>
  );
}

export function Toast({ toast }) {
  return (
    <div className={`toast ${toast ? "toast--show" : ""} ${toast?.tone === "bad" ? "toast--bad" : ""}`} role="status" aria-live="polite">
      <Icon name={toast?.tone === "bad" ? "alert" : "check"} size={15} /> {toast?.message}
    </div>
  );
}

export function Weight({ w }) {
  return (
    <span className="weight" title={`Weight ${w} of 3`}>
      {[1, 2, 3].map((i) => <i key={i} className={i <= w ? "on" : ""} />)}
    </span>
  );
}

export function Segmented({ options, value, onChange, wrap = false, label }) {
  return (
    <div className={`segmented ${wrap ? "segmented--wrap" : ""}`} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o } : o;
        return (
          <button type="button" key={opt.value} role="radio" aria-checked={value === opt.value} className={value === opt.value ? "is-active" : ""} onClick={() => onChange(opt.value)}>
            {opt.label}
            {opt.sub && <small>{opt.sub}</small>}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label, description }) {
  return (
    <label className="switch">
      <span className="switch__text">
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch__track"><span /></span>
    </label>
  );
}

export function Modal({ open, title, subtitle, onClose, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal__scrim" onClick={onClose} />
      <div className={`modal__panel ${wide ? "modal__panel--wide" : ""}`}>
        <div className="modal__head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal__body" data-lenis-prevent>{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Note({ children, icon = "info" }) {
  return <p className="note"><Icon name={icon} size={15} /> <span>{children}</span></p>;
}
