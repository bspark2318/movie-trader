"use client";

import { useState } from "react";

export function RunButton({ slug }: { slug?: string }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const [msg, setMsg] = useState("");

  async function run() {
    setState("running");
    setMsg("");
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slug ? { marketSlug: slug } : {}),
      });
      const data = await res.json();
      if (!data.ok) {
        setState("error");
        setMsg(
          data.reason === "missing-agent-keys"
            ? `Missing API keys: ${(data.missing ?? []).join(", ")}`
            : data.reason === "db-required"
              ? "Supabase not configured"
              : "Run failed",
        );
        return;
      }
      setState("done");
      const emitted = (data.results ?? []).filter(
        (r: { gate?: { emit?: boolean } }) => r.gate?.emit,
      ).length;
      setMsg(
        `Ran ${data.results?.length ?? 0} market(s) · ${emitted} recommendation(s)`,
      );
    } catch (err) {
      setState("error");
      setMsg(String(err));
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={state === "running"}
        className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {state === "running"
          ? "Running… (1–5 min)"
          : slug
            ? "Run now"
            : "Run all active markets"}
      </button>
      {msg && (
        <span
          className={`text-sm ${state === "error" ? "text-red-600" : "text-zinc-600"}`}
        >
          {msg}
        </span>
      )}
    </div>
  );
}
