// Componentes de UI reutilizables de EASYPOS.
// Consumen las clases globales del sistema de diseño (styles.css).
// Uso: import { Button, PageHeader, EmptyState, Badge } from '../components/ui';
import { useEffect } from 'react';
import { Icon } from '../../icons.jsx';

// Props (onMouseDown/onClick) para el overlay de un modal "a mano" (no el componente <Modal>):
// solo cierra si el mousedown Y el click empezaron en el overlay, para que seleccionar/copiar
// texto dentro del modal y soltar el mouse fuera no lo cierre por accidente.
export function overlayCierre(onClose) {
  return {
    onMouseDown: (e) => { e.currentTarget.dataset.mdOverlay = e.target === e.currentTarget ? '1' : '0'; },
    onClick: (e) => { if (e.currentTarget.dataset.mdOverlay === '1' && e.target === e.currentTarget) onClose?.(); },
  };
}

/* ---------- Logo (Asados Santacruz, cambia según tema) ---------- */
export function Logo({ height = 34, className = '' }) {
  return (
    <span className={`brand-logo ${className}`.trim()} aria-label="Asados Santacruz">
      <img src="/logo-oscuro.png" alt="Asados Santacruz" className="logo-black" style={{ height }} />
      <img src="/logo-claro.png" alt="Asados Santacruz" className="logo-cream" style={{ height }} />
    </span>
  );
}

/* ---------- Modal ---------- */
export function Modal({ title, subtitle, onClose, children, footer, size = 'md' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-overlay" {...overlayCierre(onClose)}>
      <div className={`modal modal--${size}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0 }}>{title}</h3>
            {subtitle && <p className="mini" style={{ margin: '2px 0 0' }}>{subtitle}</p>}
          </div>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={20} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Skeleton ---------- */
export function Skeleton({ width = '100%', height = 14, radius, style }) {
  return <span className="skeleton" style={{ display: 'block', width, height, borderRadius: radius, ...style }} />;
}

export function TableSkeleton({ cols = 4, rows = 6 }) {
  return (
    <table className="skeleton-table">
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <td key={c}><Skeleton height={12} width={c === 0 ? '70%' : '50%'} /></td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CardsSkeleton({ count = 6 }) {
  return (
    <div className="cards-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div className="card" key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton height={14} width="60%" />
          <Skeleton height={10} width="90%" />
          <Skeleton height={10} width="80%" />
          <Skeleton height={32} width="100%" style={{ marginTop: 6 }} />
        </div>
      ))}
    </div>
  );
}

/* ---------- Button ---------- */
export function Button({
  variant = 'secondary', size = 'md', loading = false,
  icon, iconSize = 16, children, className = '', ...props
}) {
  const cls = variant === 'primary' ? 'btn btn-primary'
    : variant === 'danger' ? 'btn btn-red'
    : variant === 'success' ? 'btn btn-green'
    : variant === 'ghost' ? 'btn btn-ghost'
    : 'btn';
  return (
    <button
      className={`${cls} ${size === 'sm' ? 'btn-sm' : ''} ${className}`.trim()}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <span className="ui-spinner" /> : (icon && <Icon name={icon} size={iconSize} />)}
      {children}
    </button>
  );
}

/* ---------- PageHeader ---------- */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div className="page-header__text">
        <h1>{title}</h1>
        {subtitle && <p className="subtitle" style={{ margin: 0 }}>{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}

/* ---------- Badge ---------- */
export function Badge({ status = 'gray', children }) {
  return <span className={`badge ${status}`}>{children}</span>;
}

/* ---------- EmptyState ---------- */
export function EmptyState({ icon = 'maestros', title = 'Sin registros', description, action }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={26} /></span>
      <div className="empty-title">{title}</div>
      {description && <div className="empty-desc">{description}</div>}
      {action && <div style={{ marginTop: 'var(--sp-2)' }}>{action}</div>}
    </div>
  );
}

/* ---------- LoadingState ---------- */
export function LoadingState({ label = 'Cargando…' }) {
  return (
    <div className="loading-state">
      <span className="ui-spinner" />
      <span>{label}</span>
    </div>
  );
}

/* ---------- Card ---------- */
export function Card({ className = '', children, ...props }) {
  return <div className={`card ${className}`.trim()} {...props}>{children}</div>;
}

/* ---------- Field (label + control) ---------- */
export function Field({ label, required, hint, children }) {
  return (
    <div className="field">
      {label && <label>{label}{required ? ' *' : ''}</label>}
      {children}
      {hint && <div className="mini" style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
