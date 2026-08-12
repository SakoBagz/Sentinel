"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      setError(reason instanceof Error ? reason.message : "Unable to launch the seeded demo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button className="button primary" onClick={launch} disabled={busy}>
        {busy ? "Starting seeded demo…" : "Launch seeded demo"}
      </button>
      {error && <p className="notice error" role="alert">{error}</p>}
    </div>
  );
}
