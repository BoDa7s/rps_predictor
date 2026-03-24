import React, { useEffect, useState } from "react";
import { CONSENT_TEXT_VERSION, GRADE_OPTIONS, type Grade, type PlayerProfile } from "../../players";

interface PlayerSetupFormProps {
  mode: "create" | "edit";
  player: PlayerProfile | null;
  onClose: () => void;
  onSaved: (result: { action: "create" | "update"; player: PlayerProfile }) => void;
  createPlayer: (input: Omit<PlayerProfile, "id">) => PlayerProfile;
  updatePlayer: (id: string, patch: Partial<Omit<PlayerProfile, "id">>) => void;
  origin?: "welcome" | "settings" | null;
  onBack?: () => void;
  appearance?: "modal" | "page";
  showDismissButton?: boolean;
}

function extractNameParts(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: "", lastInitial: "" };
  const segments = trimmed.split(/\s+/);
  if (segments.length === 1) {
    return { firstName: segments[0], lastInitial: "" };
  }
  const lastSegment = segments[segments.length - 1].replace(/[^A-Za-z]/g, "");
  const first = segments.slice(0, -1).join(" ");
  const initial = lastSegment ? lastSegment[0].toUpperCase() : "";
  return { firstName: first, lastInitial: initial };
}

function formatLastInitial(value: string) {
  const match = value.trim().match(/[A-Za-z]/);
  const upper = match ? match[0].toUpperCase() : "";
  return upper ? `${upper}.` : "";
}

export default function PlayerSetupForm({
  mode,
  player,
  onClose,
  onSaved,
  createPlayer,
  updatePlayer,
  origin,
  onBack,
  appearance = "modal",
  showDismissButton = true,
}: PlayerSetupFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastInitial, setLastInitial] = useState("");
  const [grade, setGrade] = useState<Grade | "">(player?.grade ?? "");
  const [school, setSchool] = useState(player?.school ?? "");
  const [priorExperience, setPriorExperience] = useState(player?.priorExperience ?? "");

  useEffect(() => {
    const parts = extractNameParts(player?.playerName ?? "");
    setFirstName(parts.firstName);
    setLastInitial(parts.lastInitial);
    setGrade(player?.grade ?? "");
    setSchool(player?.school ?? "");
    setPriorExperience(player?.priorExperience ?? "");
  }, [player, mode]);

  const saveDisabled = !firstName.trim() || !lastInitial.trim() || !grade;
  const title = mode === "edit" ? "Edit player demographics" : "Create new player";
  const showReviewNotice = mode === "edit" && player?.needsReview;
  const showBackButton = origin === "welcome" && mode === "create";
  const handleBackClick = () => {
    if (onBack) {
      onBack();
    } else {
      onClose();
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastInitial.trim();
    if (!trimmedFirst || !trimmedLast || !grade) return;
    const schoolValue = school.trim();
    const priorValue = priorExperience.trim();
    const formattedLastInitial = formatLastInitial(trimmedLast);
    const combinedName = formattedLastInitial ? `${trimmedFirst} ${formattedLastInitial}` : trimmedFirst;
    const consent = {
      agreed: true,
      timestamp: new Date().toISOString(),
      consentTextVersion: CONSENT_TEXT_VERSION,
    };
    const payload = {
      playerName: combinedName,
      grade: grade as Grade,
      school: schoolValue ? schoolValue : undefined,
      priorExperience: priorValue ? priorValue : undefined,
      consent,
      needsReview: false,
    } satisfies Omit<PlayerProfile, "id">;

    if (mode === "edit" && player) {
      updatePlayer(player.id, payload);
      onSaved({ action: "update", player: { ...player, ...payload } });
    } else {
      const created = createPlayer(payload);
      onSaved({ action: "create", player: created });
    }
  };

  const isPage = appearance === "page";
  const formClassName = isPage
    ? "flex flex-1 min-h-0 flex-col rounded-[1.75rem] border border-[color:var(--app-border)] bg-[color:var(--app-surface-card)] shadow-[var(--app-surface-shadow)]"
    : "flex flex-1 min-h-0 flex-col";
  const headingClassName = isPage ? "text-2xl font-semibold play-shell-heading" : "text-lg font-semibold text-slate-800";
  const dismissClassName = isPage
    ? "play-shell-button play-shell-button-muted rounded-full px-4 py-2 text-sm font-semibold"
    : "text-sm text-slate-500 hover:text-slate-700";
  const labelClassName = isPage ? "text-sm font-medium play-shell-heading" : "text-sm font-medium text-slate-700";
  const inputClassName = isPage
    ? "play-shell-input mt-1 w-full rounded-2xl px-3 py-2"
    : "mt-1 w-full rounded border border-slate-300 px-2 py-1 shadow-inner";
  const noticeBaseClassName = isPage ? "rounded-2xl px-3 py-3 text-sm" : "rounded border px-3 py-2 text-sm";
  const footerClassName = isPage
    ? "border-t border-[color:var(--app-border)] bg-transparent px-5 py-4"
    : "border-t border-slate-200 bg-white px-5 py-4";
  const cancelButtonClassName = isPage
    ? "play-shell-button play-shell-button-muted rounded-xl px-4 py-2 text-sm font-semibold"
    : "px-3 py-1.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200";
  const saveButtonClassName = isPage
    ? `play-shell-button rounded-xl px-4 py-2 text-sm font-semibold ${
        saveDisabled ? "play-shell-button-muted opacity-60" : "play-shell-button-accent"
      }`
    : `px-3 py-1.5 rounded text-white ${saveDisabled ? "bg-slate-300 cursor-not-allowed" : "bg-sky-600 hover:bg-sky-700 shadow"}`;

  return (
    <form onSubmit={handleSubmit} className={formClassName} aria-label="Player setup form">
      <div className="flex items-center justify-between gap-4 px-5 pt-5">
        <h2 className={headingClassName}>{title}</h2>
        {showDismissButton && (
          <button type="button" onClick={showBackButton ? handleBackClick : onClose} className={dismissClassName}>
            {showBackButton ? "Back" : "Close"}
          </button>
        )}
      </div>
      <div className="mt-4 flex-1 min-h-0 overflow-y-auto px-5">
        <div className="space-y-3 pb-5">
          {showReviewNotice && (
            <div
              className={`${noticeBaseClassName} ${
                isPage
                  ? "border border-amber-300/40 bg-amber-100/70 text-amber-900"
                  : "border border-amber-300 bg-amber-50 text-amber-700"
              }`}
            >
              Please confirm the player name and grade to continue.
            </div>
          )}
          {mode === "create" && (
            <div
              className={`${noticeBaseClassName} ${
                isPage
                  ? "border border-[color:var(--app-border-strong)] bg-[color:var(--app-accent-soft)] text-[color:var(--app-text-primary)]"
                  : "border border-sky-200 bg-sky-50 text-sky-700"
              }`}
            >
              A new player will begin a fresh training session after saving.
            </div>
          )}
          <label className={labelClassName}>
            First name
            <input
              type="text"
              value={firstName}
              onChange={event => setFirstName(event.target.value)}
              className={inputClassName}
              placeholder="e.g. Alex"
              required
            />
          </label>
          <label className={labelClassName}>
            Last name initial
            <input
              type="text"
              value={lastInitial}
              onChange={event => setLastInitial(event.target.value)}
              className={inputClassName}
              placeholder="e.g. W"
              maxLength={3}
              required
            />
          </label>
          <label className={labelClassName}>
            Grade
            <select
              value={grade}
              onChange={event => setGrade(event.target.value as Grade | "")}
              className={inputClassName}
              required
            >
              <option value="" disabled>
                Select grade
              </option>
              {GRADE_OPTIONS.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClassName}>
            School (optional)
            <input
              type="text"
              value={school}
              onChange={event => setSchool(event.target.value)}
              className={inputClassName}
              placeholder="e.g. Roosevelt Elementary"
            />
          </label>
          <label className={labelClassName}>
            Prior experience (optional)
            <textarea
              value={priorExperience}
              onChange={event => setPriorExperience(event.target.value)}
              rows={3}
              className={inputClassName}
              placeholder="Tell us, have you played Rock-Paper-Scissors before, or do you know some AI basics?"
            />
          </label>
        </div>
      </div>
      <div className={footerClassName}>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {showBackButton && showDismissButton ? (
            <>
              <button type="button" onClick={handleBackClick} className={cancelButtonClassName}>
                Back
              </button>
              <button type="submit" disabled={saveDisabled} className={saveButtonClassName}>
                Save profile
              </button>
            </>
          ) : (
            <>
              {showDismissButton && (
                <button type="button" onClick={onClose} className={cancelButtonClassName}>
                  Cancel
                </button>
              )}
              <button type="submit" disabled={saveDisabled} className={saveButtonClassName}>
                Save profile
              </button>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
