"use client";

import { ClipboardList } from "lucide-react";
import { useEffect, useState } from "react";

import { getAuditEvents, type AuditEvent } from "@/lib/api";

function formatAction(action: string): string {
  return action.replaceAll(".", " / ").replaceAll("_", " ");
}

function formatDetails(details: Record<string, unknown>): string | null {
  const entries = Object.entries(details).slice(0, 3);
  if (entries.length === 0) return null;
  return entries.map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`).join(" · ");
}

export function AuditPanel({
  runId,
  refreshKey = 0,
  limit = 8,
}: {
  runId: string;
  refreshKey?: number;
  limit?: number;
}) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getAuditEvents("run", runId)
      .then((value) => {
        if (!active) return;
        setEvents(value.slice(0, limit));
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Unable to load audit history");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [runId, refreshKey, limit]);

  return (
    <section className="card audit-panel" aria-labelledby={`audit-heading-${runId}`}>
      <div className="section-heading">
        <div>
          <div className="eyebrow">Accountability trail</div>
          <h2 id={`audit-heading-${runId}`}>Recent operator actions</h2>
          <p>Authenticated run mutations recorded by the system of record.</p>
        </div>
        <ClipboardList size={18} aria-hidden="true" />
      </div>
      {loading ? (
        <div className="audit-state" role="status">Loading audit history…</div>
      ) : error ? (
        <div className="audit-state" role="status">Audit history is temporarily unavailable.</div>
      ) : events.length === 0 ? (
        <div className="audit-state">No operator actions have been recorded for this run.</div>
      ) : (
        <div className="audit-list">
          {events.map((event) => {
            const details = formatDetails(event.details);
            return (
              <article className="audit-event" key={event.id}>
                <div>
                  <strong>{formatAction(event.action)}</strong>
                  <span>{event.actor_role.toUpperCase()} · {event.actor_subject}</span>
                  {details && <span>{details}</span>}
                </div>
                <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
