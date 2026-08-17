import { Icon } from './Icons';

export function PageHead({ title, subtitle, children }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="spacer row">{children}</div>}
    </header>
  );
}

export function Card({ glyph, title, description, action, children, className = '' }) {
  const Glyph = glyph ? Icon[glyph] : null;
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          {Glyph && (
            <span className="glyph">
              <Glyph />
            </span>
          )}
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {action && <div className="spacer row">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, focus = false }) {
  return (
    <div className={`stat ${focus ? 'focus' : ''}`}>
      <span className="kicker">{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export function Avatar({ name, size = '' }) {
  return <span className={`avatar ${size}`}>{(name || '?').slice(0, 1).toUpperCase()}</span>;
}

export function Person({ name, sub, size = '' }) {
  return (
    <div className="person">
      <Avatar name={name} size={size} />
      <div>
        <b>{name}</b>
        <small>{sub || '—'}</small>
      </div>
    </div>
  );
}

const PRIORITY_TONE = { HIGH: 'red', MEDIUM: 'amber', LOW: '' };

export function PriorityChip({ priority }) {
  return <span className={`chip ${PRIORITY_TONE[priority] || ''}`}>{priority.toLowerCase()}</span>;
}

const STATUS_LABEL = {
  PENDING: 'pending',
  PROGRESS: 'in progress',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
};

const STATUS_TONE = { COMPLETED: 'green', BLOCKED: 'red', PROGRESS: '', PENDING: '' };

export function StatusChip({ status }) {
  return <span className={`chip ${STATUS_TONE[status] || ''}`}>{STATUS_LABEL[status]}</span>;
}

export function Switch({ checked, onChange, disabled = false, title }) {
  return (
    <label className={`switch ${disabled ? 'disabled' : ''}`} title={title}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="track" />
    </label>
  );
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}

export function Modal({ open, onClose, title, description, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-panel ${wide ? 'wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Close">
            <Icon.close width={17} height={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export { STATUS_LABEL };
