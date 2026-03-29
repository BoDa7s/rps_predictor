import React, { useEffect, useMemo, useState } from "react";
import PlaySectionLayout, { type PlaySection } from "../../components/play/PlaySectionLayout";
import { CONSENT_TEXT_VERSION, GRADE_OPTIONS, type Grade } from "../../players";
import { usePlayers } from "../../players";
import { usePlayTheme } from "../../routes/PlayThemeProvider";
import {
  cloneProfilePreferences,
  DEFAULT_PROFILE_PREFERENCES,
  DEFAULT_THEME_COLOR_PREFERENCES,
  GAMEPLAY_BEST_OF_OPTIONS,
  GAMEPLAY_DIFFICULTY_OPTIONS,
  type ThemeMode,
  useStats,
} from "../../stats";
import type { AIMode, BestOf } from "../../gameTypes";

type PlayerFormState = {
  playerName: string;
  grade: Grade;
  school: string;
  priorExperience: string;
};

const emptyPlayerForm: PlayerFormState = {
  playerName: "",
  grade: "Not applicable",
  school: "",
  priorExperience: "",
};

const sectionCardClass = "play-shell-card rounded-2xl p-5";
const fieldClass = "play-shell-input w-full rounded-2xl px-4 py-3";
const fieldLabelClass = "space-y-2 text-sm play-shell-text-muted";
const fieldLabelTitleClass = "font-semibold play-shell-heading";
const subtlePanelClass = "play-shell-panel rounded-2xl px-4 py-4 text-sm";
const accentButtonClass =
  "play-shell-button play-shell-button-accent rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const mutedButtonClass =
  "play-shell-button play-shell-button-muted rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function downloadCsv(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function SettingsPage() {
  const { players, currentPlayer, setCurrentPlayer, createPlayer, updatePlayer } = usePlayers();
  const {
    currentProfile,
    profiles,
    selectProfile,
    createProfile,
    updateProfile,
    forkProfileVersion,
    clearModelStateForProfile,
    exportRoundsCsv,
    rounds,
  } = useStats();
  const { themePreference, themeOptions, applyThemePreference, resolvedThemeMode } = usePlayTheme();
  const [playerForm, setPlayerForm] = useState<PlayerFormState>(emptyPlayerForm);
  const [newPlayerForm, setNewPlayerForm] = useState<PlayerFormState>(emptyPlayerForm);
  const [themeModeEditor, setThemeModeEditor] = useState<ThemeMode>("dark");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!currentPlayer) {
      setPlayerForm(emptyPlayerForm);
      return;
    }
    setPlayerForm({
      playerName: currentPlayer.playerName,
      grade: currentPlayer.grade,
      school: currentPlayer.school ?? "",
      priorExperience: currentPlayer.priorExperience ?? "",
    });
  }, [currentPlayer]);

  useEffect(() => {
    const currentTheme = currentProfile?.preferences.theme;
    if (currentTheme === "light" || currentTheme === "dark") {
      setThemeModeEditor(currentTheme);
    }
  }, [currentProfile?.id, currentProfile?.preferences.theme]);

  const currentPreferences = currentProfile?.preferences ?? DEFAULT_PROFILE_PREFERENCES;
  const activeThemeColors = currentPreferences.themeColors[themeModeEditor];

  const profileTrainingLabel = useMemo(() => {
    if (!currentProfile) return "No statistics profile selected";
    if (currentProfile.trained) return "Training complete";
    return `${currentProfile.trainingCount ?? 0}/5 rounds completed`;
  }, [currentProfile]);

  const applyCurrentProfilePreferences = (updater: (draft: ReturnType<typeof cloneProfilePreferences>) => void) => {
    if (!currentProfile) return;
    const next = cloneProfilePreferences(currentProfile.preferences);
    updater(next);
    updateProfile(currentProfile.id, { preferences: next });
  };

  const handleSavePlayer = () => {
    if (!currentPlayer || !playerForm.playerName.trim()) return;
    updatePlayer(currentPlayer.id, {
      playerName: playerForm.playerName.trim(),
      grade: playerForm.grade,
      school: playerForm.school.trim() || undefined,
      priorExperience: playerForm.priorExperience.trim() || undefined,
      needsReview: false,
    });
    setStatusMessage("Player demographics saved.");
  };

  const handleCreatePlayer = () => {
    if (!newPlayerForm.playerName.trim()) return;
    createPlayer({
      playerName: newPlayerForm.playerName.trim(),
      grade: newPlayerForm.grade,
      school: newPlayerForm.school.trim() || undefined,
      priorExperience: newPlayerForm.priorExperience.trim() || undefined,
      consent: {
        agreed: true,
        timestamp: new Date().toISOString(),
        consentTextVersion: CONSENT_TEXT_VERSION,
      },
      needsReview: false,
    });
    setNewPlayerForm(emptyPlayerForm);
    setStatusMessage("New player created and selected.");
  };

  const handleCreateProfile = () => {
    const created = createProfile();
    if (created) {
      setStatusMessage(`New statistics profile created: ${created.name}.`);
    }
  };

  const handleStartFreshProfile = () => {
    if (!currentProfile) return;
    const next = forkProfileVersion(currentProfile.id);
    if (!next) return;
    clearModelStateForProfile(currentProfile.id);
    setStatusMessage(`Fresh training profile created: ${next.name}.`);
  };

  const handleExport = () => {
    if (!currentProfile || !rounds.length) return;
    const filename = `rps-${slugify(currentProfile.name || "profile") || "profile"}-rounds.csv`;
    downloadCsv(filename, exportRoundsCsv());
    setStatusMessage("CSV export started.");
  };

  const handleThemePreferenceChange = (value: "light" | "dark" | "system") => {
    applyThemePreference(value);
    setStatusMessage(`Theme preference set to ${value}.`);
  };

  const handleThemeColorChange = (key: "accent" | "background", value: string) => {
    applyCurrentProfilePreferences(preferences => {
      preferences.themeColors[themeModeEditor][key] = value;
    });
    setStatusMessage(`${themeModeEditor} ${key} color updated.`);
  };

  const handleResetThemeMode = () => {
    applyCurrentProfilePreferences(preferences => {
      preferences.themeColors[themeModeEditor] = { ...DEFAULT_THEME_COLOR_PREFERENCES[themeModeEditor] };
    });
    setStatusMessage(`${themeModeEditor} colors reset.`);
  };

  const handleGameplayDifficultyChange = (value: AIMode) => {
    applyCurrentProfilePreferences(preferences => {
      preferences.gameplay.aiDifficulty = value;
    });
    setStatusMessage(`AI difficulty set to ${value}.`);
  };

  const handleGameplayBestOfChange = (value: BestOf) => {
    applyCurrentProfilePreferences(preferences => {
      preferences.gameplay.bestOf = value;
    });
    setStatusMessage(`Best of set to ${value}.`);
  };

  const sections = useMemo<PlaySection[]>(
    () => [
      {
        id: "profile-data",
        label: "Profile & Data",
        title: "Manage the active player, demographics, and local player records",
        description: "Player identity stays separate from match history so you can reuse the app for multiple learners.",
        content: (
          <div className="grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
            <article className={sectionCardClass}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={fieldLabelClass}>
                  <span className={fieldLabelTitleClass}>Active player</span>
                  <select
                    value={currentPlayer?.id ?? ""}
                    onChange={event => setCurrentPlayer(event.target.value || null)}
                    className={fieldClass}
                  >
                    {!players.length && <option value="">No players yet</option>}
                    {players.map(player => (
                      <option key={player.id} value={player.id}>
                        {player.playerName}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={subtlePanelClass}>
                  <div className={fieldLabelTitleClass}>Statistics profile</div>
                  <div className="mt-2">{currentProfile?.name ?? "No profile selected"}</div>
                  <div className="mt-1 play-shell-text-muted">{profileTrainingLabel}</div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className={fieldLabelClass}>
                  <span className={fieldLabelTitleClass}>Player name</span>
                  <input
                    value={playerForm.playerName}
                    onChange={event => setPlayerForm(form => ({ ...form, playerName: event.target.value }))}
                    className={fieldClass}
                  />
                </label>
                <label className={fieldLabelClass}>
                  <span className={fieldLabelTitleClass}>Grade</span>
                  <select
                    value={playerForm.grade}
                    onChange={event => setPlayerForm(form => ({ ...form, grade: event.target.value as Grade }))}
                    className={fieldClass}
                  >
                    {GRADE_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={fieldLabelClass}>
                  <span className={fieldLabelTitleClass}>School</span>
                  <input
                    value={playerForm.school}
                    onChange={event => setPlayerForm(form => ({ ...form, school: event.target.value }))}
                    className={fieldClass}
                  />
                </label>
                <label className={fieldLabelClass}>
                  <span className={fieldLabelTitleClass}>Prior experience</span>
                  <input
                    value={playerForm.priorExperience}
                    onChange={event => setPlayerForm(form => ({ ...form, priorExperience: event.target.value }))}
                    className={fieldClass}
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={handleSavePlayer}
                disabled={!currentPlayer || !playerForm.playerName.trim()}
                className={`${accentButtonClass} mt-6`}
              >
                Save player details
              </button>
            </article>

            <article className={sectionCardClass}>
              <p className="play-shell-eyebrow text-xs font-semibold uppercase tracking-[0.24em]">Create Player</p>
              <div className="mt-4 grid gap-4">
                <label className={fieldLabelClass}>
                  <span className={fieldLabelTitleClass}>Player name</span>
                  <input
                    value={newPlayerForm.playerName}
                    onChange={event => setNewPlayerForm(form => ({ ...form, playerName: event.target.value }))}
                    className={fieldClass}
                  />
                </label>
                <label className={fieldLabelClass}>
                  <span className={fieldLabelTitleClass}>Grade</span>
                  <select
                    value={newPlayerForm.grade}
                    onChange={event => setNewPlayerForm(form => ({ ...form, grade: event.target.value as Grade }))}
                    className={fieldClass}
                  >
                    {GRADE_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={fieldLabelClass}>
                  <span className={fieldLabelTitleClass}>School</span>
                  <input
                    value={newPlayerForm.school}
                    onChange={event => setNewPlayerForm(form => ({ ...form, school: event.target.value }))}
                    className={fieldClass}
                  />
                </label>
                <label className={fieldLabelClass}>
                  <span className={fieldLabelTitleClass}>Prior experience</span>
                  <input
                    value={newPlayerForm.priorExperience}
                    onChange={event => setNewPlayerForm(form => ({ ...form, priorExperience: event.target.value }))}
                    className={fieldClass}
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={handleCreatePlayer}
                disabled={!newPlayerForm.playerName.trim()}
                className={`${mutedButtonClass} mt-6`}
              >
                Create and select player
              </button>
            </article>
          </div>
        ),
      },
      {
        id: "training",
        label: "Training",
        title: "Control statistics profiles and training lifecycle",
        description: "Training progress lives on the active statistics profile so a fresh profile can start learning from zero.",
        content: (
          <div className="grid gap-4 lg:grid-cols-[1fr,1fr]">
            <article className={sectionCardClass}>
              <div className="space-y-4">
                <select
                  value={currentProfile?.id ?? ""}
                  onChange={event => selectProfile(event.target.value)}
                  disabled={!profiles.length}
                  className={fieldClass}
                >
                  {!profiles.length && <option value="">No profiles yet</option>}
                  {profiles.map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleCreateProfile}
                    className={accentButtonClass}
                  >
                    Create new profile
                  </button>
                  <button
                    type="button"
                    onClick={handleStartFreshProfile}
                    disabled={!currentProfile}
                    className={mutedButtonClass}
                  >
                    Start fresh training profile
                  </button>
                </div>
              </div>
            </article>
            <article className={sectionCardClass}>
              <h3 className="play-shell-heading text-lg font-semibold">Current training state</h3>
              <p className="mt-3 text-sm leading-7 play-shell-muted">
                {currentProfile
                  ? `${currentProfile.name} is currently ${currentProfile.trained ? "fully trained" : "still learning"} with ${currentProfile.trainingCount ?? 0} of 5 rounds completed.`
                  : "Select or create a statistics profile to start tracking training progress."}
              </p>
            </article>
          </div>
        ),
      },
      {
        id: "gameplay",
        label: "Gameplay",
        title: "Set durable challenge preferences for AI difficulty and match length",
        description: "These settings persist on the active statistics profile and apply when challenge launches. Training remains AI off with random mode on.",
        content: (
          <div className="grid gap-4 lg:grid-cols-2">
            <article className={sectionCardClass}>
              <h3 className="play-shell-heading text-lg font-semibold">AI Difficulty</h3>
              <p className="mt-3 text-sm leading-7 play-shell-muted">
                Fair softens the predictor, Normal matches the current baseline, and Ruthless commits harder to the strongest read.
              </p>
              <div className="play-shell-toggle mt-5 inline-flex flex-wrap overflow-hidden rounded-full border">
                {GAMEPLAY_DIFFICULTY_OPTIONS.map(option => {
                  const isActive = currentPreferences.gameplay.aiDifficulty === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleGameplayDifficultyChange(option)}
                      disabled={!currentProfile}
                      className={`play-shell-toggle-button px-4 py-2 text-sm font-semibold capitalize transition ${
                        isActive ? "is-active" : ""
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </article>
            <article className={sectionCardClass}>
              <h3 className="play-shell-heading text-lg font-semibold">Best of</h3>
              <p className="mt-3 text-sm leading-7 play-shell-muted">
                Challenge matches end as soon as one side reaches the required majority for the selected format.
              </p>
              <div className="play-shell-toggle mt-5 inline-flex flex-wrap overflow-hidden rounded-full border">
                {GAMEPLAY_BEST_OF_OPTIONS.map(option => {
                  const isActive = currentPreferences.gameplay.bestOf === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleGameplayBestOfChange(option)}
                      disabled={!currentProfile}
                      className={`play-shell-toggle-button px-4 py-2 text-sm font-semibold transition ${
                        isActive ? "is-active" : ""
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </article>
          </div>
        ),
      },
      {
        id: "display-visuals",
        label: "Display / Visuals",
        title: "Control theme preference and per-mode interface colors",
        description: "These are durable profile-level visual preferences shared across the routed play shell.",
        content: (
          <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
            <article className={sectionCardClass}>
              <div className="space-y-2 text-sm play-shell-text-muted">
                <span className="font-semibold play-shell-heading">Theme preference</span>
                <div className="play-shell-toggle mt-3 inline-flex items-center overflow-hidden rounded-full border">
                  {themeOptions.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleThemePreferenceChange(option.value)}
                      disabled={!currentProfile}
                      className={`play-shell-toggle-button px-4 py-2 text-sm font-semibold transition ${
                        themePreference === option.value ? "is-active" : ""
                      }`}
                    >
                      {option.value === "system" ? "System" : option.value === "dark" ? "Dark" : "Light"}
                    </button>
                  ))}
                </div>
                <p className="pt-2 text-sm play-shell-text-muted">
                  Current output: <span className="font-semibold play-shell-heading capitalize">{resolvedThemeMode}</span>
                </p>
              </div>

              <div className="play-shell-toggle mt-5 inline-flex overflow-hidden rounded-full border">
                {(["light", "dark"] as ThemeMode[]).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setThemeModeEditor(mode)}
                    className={`play-shell-toggle-button px-4 py-2 text-sm font-semibold transition ${
                      themeModeEditor === mode ? "is-active" : ""
                    }`}
                  >
                    {mode === "light" ? "Light colors" : "Dark colors"}
                  </button>
                ))}
              </div>
            </article>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={sectionCardClass}>
                <span className="text-sm font-semibold play-shell-heading">Accent</span>
                <input
                  type="color"
                  value={activeThemeColors.accent}
                  onChange={event => handleThemeColorChange("accent", event.target.value)}
                  disabled={!currentProfile}
                  className="play-shell-input mt-4 h-12 w-full cursor-pointer rounded-2xl px-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span className="play-shell-input mt-4 block rounded-xl px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] play-shell-text-muted">
                  {activeThemeColors.accent}
                </span>
              </label>

              <label className={sectionCardClass}>
                <span className="text-sm font-semibold play-shell-heading">Background</span>
                <input
                  type="color"
                  value={activeThemeColors.background}
                  onChange={event => handleThemeColorChange("background", event.target.value)}
                  disabled={!currentProfile}
                  className="play-shell-input mt-4 h-12 w-full cursor-pointer rounded-2xl px-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span className="play-shell-input mt-4 block rounded-xl px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] play-shell-text-muted">
                  {activeThemeColors.background}
                </span>
              </label>

              <button
                type="button"
                onClick={handleResetThemeMode}
                disabled={!currentProfile}
                className={`${mutedButtonClass} sm:col-span-2 py-4`}
              >
                Reset {themeModeEditor} theme colors
              </button>
            </div>
          </div>
        ),
      },
      {
        id: "export-reset",
        label: "Export / Reset",
        title: "Export current data and reset by creating a fresh training profile",
        description: "Resets happen through new statistics profiles so older runs remain reviewable instead of being erased.",
        content: (
          <div className="grid gap-4 lg:grid-cols-[1fr,1fr]">
            <article className={sectionCardClass}>
              <h3 className="play-shell-heading text-lg font-semibold">Export current profile CSV</h3>
              <p className="mt-3 text-sm leading-7 play-shell-muted">
                Exported CSV files come from the active statistics profile and keep local demographics and round history
                aligned.
              </p>
              <button
                type="button"
                onClick={handleExport}
                disabled={!currentProfile || !rounds.length}
                className={`${mutedButtonClass} mt-5`}
              >
                Export current profile CSV
              </button>
            </article>

            <article className={sectionCardClass}>
              <h3 className="play-shell-heading text-lg font-semibold">Reset by starting fresh</h3>
              <p className="mt-3 text-sm leading-7 play-shell-muted">
                A fresh profile archives the current training path and creates a new predictor history without wiping
                older profiles from the device.
              </p>
              <button
                type="button"
                onClick={handleStartFreshProfile}
                disabled={!currentProfile}
                className={`${accentButtonClass} mt-5`}
              >
                Start fresh training profile
              </button>
            </article>
          </div>
        ),
      },
    ],
    [
      activeThemeColors.accent,
      activeThemeColors.background,
      currentPlayer,
      currentPreferences.theme,
      currentProfile,
      handleExport,
      players,
      playerForm.grade,
      playerForm.playerName,
      playerForm.priorExperience,
      playerForm.school,
      profileTrainingLabel,
      profiles,
      rounds.length,
      themeModeEditor,
      newPlayerForm.grade,
      newPlayerForm.playerName,
      newPlayerForm.priorExperience,
      newPlayerForm.school,
    ],
  );

  const banner = statusMessage ? (
    <section className="play-shell-accent-card rounded-2xl px-5 py-4 text-sm">
      {statusMessage}
    </section>
  ) : undefined;

  return <PlaySectionLayout sections={sections} navLabel="Settings Sections" banner={banner} />;
}
