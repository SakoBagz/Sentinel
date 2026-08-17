import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/" aria-label="Sentinel overview">
            <span>SENTINEL</span>
            <span className="brand-subtitle">SIMULATION OPERATIONS</span>
          </Link>
          <nav className="topnav" aria-label="Primary navigation">
            <Link href="/">Overview</Link>
            <Link href="/missions">Missions</Link>
          </nav>
          <div className="topbar-meta" aria-label="Application mode">
            <span className="mode-label">LOCAL</span>
            <span className="mode-divider" aria-hidden="true" />
            <span>SIMULATION ONLY</span>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
