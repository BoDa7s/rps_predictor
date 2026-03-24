import React, { useEffect, useMemo, useState } from "react";

export interface PlaySection {
  id: string;
  label: string;
  title: string;
  description?: string;
  content: React.ReactNode;
}

interface PlaySectionLayoutProps {
  sections: PlaySection[];
  banner?: React.ReactNode;
  navLabel?: string;
}

function getInitialSectionId(sections: PlaySection[]) {
  if (typeof window === "undefined") {
    return sections[0]?.id ?? "";
  }
  const hash = window.location.hash.replace(/^#/, "");
  return sections.some(section => section.id === hash) ? hash : sections[0]?.id ?? "";
}

export default function PlaySectionLayout({
  sections,
  banner,
  navLabel = "Sections",
}: PlaySectionLayoutProps) {
  const [activeSectionId, setActiveSectionId] = useState(() => getInitialSectionId(sections));
  const activeSection = useMemo(
    () => sections.find(section => section.id === activeSectionId) ?? sections[0] ?? null,
    [activeSectionId, sections],
  );

  useEffect(() => {
    if (!sections.length) return;

    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (sections.some(section => section.id === hash)) {
        setActiveSectionId(hash);
      }
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [sections]);

  useEffect(() => {
    if (!sections.length) return;
    if (sections.some(section => section.id === activeSectionId)) return;
    setActiveSectionId(sections[0].id);
  }, [activeSectionId, sections]);

  const selectSection = (id: string) => {
    setActiveSectionId(id);
    if (typeof window !== "undefined") {
      const nextUrl = `${window.location.pathname}${window.location.search}#${id}`;
      window.history.replaceState(null, "", nextUrl);
    }
  };

  return (
    <div className="grid gap-6">
      {banner}

      <div className="play-shell-surface rounded-[2rem] p-3 shadow-[0_24px_60px_rgba(2,6,23,0.14)] sm:p-4">
        <div className="mb-4 lg:hidden">
          <label className="play-shell-eyebrow block text-xs font-semibold uppercase tracking-[0.24em]">
            {navLabel}
          </label>
          <select
            value={activeSectionId}
            onChange={event => selectSection(event.target.value)}
            className="play-shell-input mt-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold"
          >
            {sections.map(section => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 lg:grid-cols-[240px,minmax(0,1fr)] lg:gap-6">
          <aside className="hidden lg:block">
            <div className="play-shell-panel sticky top-28 rounded-[1.75rem] p-3">
              <div className="play-shell-eyebrow px-3 pb-3 pt-2 text-xs font-semibold uppercase tracking-[0.24em]">
                {navLabel}
              </div>
              <nav className="grid gap-2">
                {sections.map(section => {
                  const isActive = section.id === activeSectionId;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => selectSection(section.id)}
                      className={`play-shell-section-button rounded-2xl border px-4 py-3 text-left transition ${isActive ? "is-active" : ""}`}
                    >
                      <div className="text-sm font-semibold">{section.label}</div>
                      {section.description && (
                        <div className={`mt-1 text-xs leading-5 ${isActive ? "play-shell-section-button-detail-active" : "play-shell-section-button-detail"}`}>
                          {section.description}
                        </div>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {activeSection && (
            <section
              id={activeSection.id}
              className="play-shell-panel rounded-[1.75rem] p-5 shadow-[0_18px_40px_rgba(2,6,23,0.08)] sm:p-6"
            >
              <header className="border-b border-[color:var(--app-border)] pb-4">
                <p className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.24em]">
                  {activeSection.label}
                </p>
                <h2 className="play-shell-heading mt-3 text-2xl font-semibold tracking-[-0.03em]">
                  {activeSection.title}
                </h2>
                {activeSection.description && (
                  <p className="play-shell-muted mt-3 max-w-3xl text-sm leading-7">{activeSection.description}</p>
                )}
              </header>
              <div className="mt-5">{activeSection.content}</div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
