import Link from "next/link";
import type { ReactNode } from "react";

export type Breadcrumb = { label: string; href?: string };

export function PageHeader({
  eyebrow,
  title,
  description,
  breadcrumbs = [],
  actions,
  status,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <header className="page-header">
      {breadcrumbs.length > 0 && (
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, index) => (
            <span className="breadcrumb-item" key={`${crumb.label}-${index}`}>
              {index > 0 && <span className="breadcrumb-separator" aria-hidden="true">/</span>}
              {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span aria-current="page">{crumb.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="page-header-row">
        <div className="page-header-copy">
          <div className="eyebrow">{eyebrow}</div>
          <div className="page-title-row">
            <h1>{title}</h1>
            {status}
          </div>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </header>
  );
}
