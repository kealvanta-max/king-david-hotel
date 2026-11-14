import type { ReactNode } from 'react';

/** Accessible names are mandatory; visual badges never convey status by color alone. */
export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'positive' | 'warning' | 'danger' }) {
  return <span className={`status-badge status-${tone}`}><span aria-hidden="true" className="status-dot" />{children}</span>;
}
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><h3>{title}</h3><p>{children}</p></div>;
}
