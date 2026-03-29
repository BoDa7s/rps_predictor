export type PlayOutcomeTone = "win" | "lose" | "tie" | "pending";

export const playOutcomeToneClasses: Record<PlayOutcomeTone, string> = {
  win: "border-emerald-300/60 bg-emerald-400/10 text-emerald-500",
  lose: "border-rose-300/60 bg-rose-400/10 text-rose-500",
  tie: "border-amber-300/60 bg-amber-400/10 text-amber-500",
  pending:
    "border-[color:var(--app-border)] bg-[color:var(--app-surface-subtle)] text-[color:var(--app-text-secondary)]",
};

export const playOutcomeAccentHex: Record<PlayOutcomeTone, string> = {
  win: "#22c55e",
  lose: "#fb7185",
  tie: "#f59e0b",
  pending: "var(--app-accent)",
};
