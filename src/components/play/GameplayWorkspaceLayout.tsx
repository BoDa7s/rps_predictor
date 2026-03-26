import React from "react";

interface GameplayWorkspaceLayoutProps {
  header: React.ReactNode;
  status: React.ReactNode;
  arena: React.ReactNode;
  controls: React.ReactNode;
  rail: React.ReactNode;
  history: React.ReactNode;
}

export default function GameplayWorkspaceLayout({
  header,
  status,
  arena,
  controls,
  rail,
  history,
}: GameplayWorkspaceLayoutProps) {
  return (
    <div
      className="h-full min-h-0 overflow-hidden"
      style={{
        backgroundImage:
          "radial-gradient(circle at top left, color-mix(in srgb, var(--app-accent-soft) 42%, transparent), transparent 30%), radial-gradient(circle at bottom right, color-mix(in srgb, var(--app-accent-muted) 26%, transparent), transparent 24%)",
      }}
    >
      <section className="grid h-full min-h-0 overflow-hidden bg-[color:var(--app-bg)] [grid-template-rows:auto_auto_minmax(0,1fr)_5.75rem] md:[grid-template-rows:auto_auto_minmax(0,1fr)_6rem]">
        <div className="border-b border-[color:var(--app-border)] px-3 py-2 sm:px-4">{header}</div>
        <div className="border-b border-[color:var(--app-border)] bg-[color:color-mix(in_srgb,var(--app-surface-subtle)_48%,transparent)] px-3 py-2 sm:px-4">
          {status}
        </div>

        <div className="grid min-h-0 md:grid-cols-[minmax(0,1fr)_clamp(16rem,25vw,20rem)]">
          <div className="grid min-h-0 [grid-template-rows:minmax(0,1fr)_5.9rem] border-b border-[color:var(--app-border)] md:border-b-0 md:border-r md:[grid-template-rows:minmax(0,1fr)_6.4rem] lg:[grid-template-rows:minmax(0,1fr)_6.8rem]">
            <div className="min-h-0 px-3 py-3 sm:px-4 sm:py-4">{arena}</div>
            <div className="border-t border-[color:var(--app-border)] bg-[color:color-mix(in_srgb,var(--app-surface-subtle)_36%,transparent)] px-3 py-2.5 sm:px-4">
              {controls}
            </div>
          </div>

          <div className="min-h-0 bg-[color:color-mix(in_srgb,var(--app-surface-subtle)_22%,transparent)] px-3 py-3 sm:px-4 sm:py-4">
            {rail}
          </div>
        </div>

        <div className="min-h-0 border-t border-[color:var(--app-border)] bg-[color:color-mix(in_srgb,var(--app-surface-subtle)_34%,transparent)] px-3 py-2 sm:px-4">
          {history}
        </div>
      </section>
    </div>
  );
}
