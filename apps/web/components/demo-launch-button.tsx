"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";

import { launchDemo } from "@/lib/api";

export function DemoLaunchButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const launch = async () => {
    setBusy(true);
    setError(null);
    try {
      const run = await launchDemo();
      router.push(`/runs/${run.id}/live`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to launch the seeded run");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hero-action-block">
      <button className="button primary" onClick={launch} disabled={busy} aria-busy={busy}>
        <Play size={14} fill="currentColor" aria-hidden="true" />
        {busy ? "Creating seeded run…" : "Launch seeded run"}
      </button>
      {error && <p className="notice error" role="alert">{error}</p>}
    </div>
  );
}
