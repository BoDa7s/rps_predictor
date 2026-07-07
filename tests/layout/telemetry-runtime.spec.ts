import { expect, test, type Download, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const DEV_PIN = "02853Adam/@";
const TARGET_PROJECT = "browser-1280x720";

const TIMINGS = {
  challenge: {
    countdownTickMs: 60,
    revealHoldMs: 20,
    resultBannerMs: 200,
    robotRoundReactionMs: 100,
    robotRoundRestMs: 20,
    robotResultReactionMs: 100,
    robotResultRestMs: 20,
  },
  practice: {
    countdownTickMs: 60,
    revealHoldMs: 20,
    resultBannerMs: 200,
    robotRoundReactionMs: 100,
    robotRoundRestMs: 20,
    robotResultReactionMs: 100,
    robotResultRestMs: 20,
  },
};

function seedStorage(page: Page, seed: Record<string, unknown>) {
  return page.addInitScript(data => {
    window.localStorage.clear();
    Object.entries(data).forEach(([key, value]) => {
      window.localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    });
  }, seed);
}

async function readTelemetry(page: Page) {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem("rps_telemetry_v1") ?? "{}"));
}

function basePlayer(playerId: string, playerName: string, timestamp: string) {
  return {
    id: playerId,
    playerName,
    grade: "5",
    school: "Telemetry Lab",
    priorExperience: "Returning player",
    consent: { agreed: true, timestamp, consentTextVersion: "v1" },
    needsReview: false,
  };
}

function baseProfile(profileId: string, playerId: string, timestamp: string, overrides?: Record<string, unknown>) {
  return {
    id: profileId,
    playerId,
    name: "primary",
    baseName: "primary",
    createdAt: timestamp,
    trainingCount: 5,
    trained: true,
    predictorDefault: true,
    seenPostTrainingCTA: true,
    version: 1,
    previousProfileId: null,
    nextProfileId: null,
    preferences: {
      theme: "dark",
      themeColors: {
        light: { accent: "#2563EB", background: "#F6F8FC" },
        dark: { accent: "#60A5FA", background: "#0B1220" },
      },
      gameplay: { aiDifficulty: "normal", bestOf: 3 },
    },
    ...overrides,
  };
}

async function waitForTelemetryAction(page: Page, action: string) {
  await expect.poll(async () => {
    const telemetry = await readTelemetry(page);
    return Object.values(telemetry.uiEventsById ?? {}).some((event: any) => event.action === action);
  }, { timeout: 10_000 }).toBeTruthy();
}

async function finishTrainingRun(page: Page) {
  for (let index = 0; index < 5; index += 1) {
    const rock = page.getByTestId("training-controls-option-rock");
    await expect(rock).toBeVisible();
    await expect(rock).toBeEnabled();
    await rock.click();
    await page.waitForTimeout(850);
  }
}

async function playChallengeUntilResults(page: Page) {
  const playAgainButton = page.getByRole("button", { name: /play again/i });
  for (let index = 0; index < 9; index += 1) {
    if (await playAgainButton.isVisible().catch(() => false)) {
      break;
    }
    const rock = page.getByTestId("challenge-controls-option-rock");
    await expect(rock).toBeVisible();
    await expect(rock).toBeEnabled({ timeout: 5_000 });
    await rock.click();
    await page.waitForTimeout(950);
  }
  await expect(playAgainButton).toBeVisible({ timeout: 10_000 });
}

async function unlockDeveloperPage(page: Page) {
  await page.goto("/play/developer");
  await page.getByLabel(/^PIN$/i).fill(DEV_PIN);
  await page.getByRole("button", { name: /^unlock$/i }).click();
  await expect(page.getByTestId("telemetry-export-panel")).toBeVisible();
}

async function readOverviewCounts(page: Page) {
  const values = await page.locator("text=Players").locator("..").evaluateAll(nodes => {
    return nodes.slice(0, 4).map(node => node.textContent?.trim() ?? "");
  });
  return values;
}

test.describe("telemetry runtime verification", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== TARGET_PROJECT, "Run telemetry verification on one browser-content viewport only.");
  });

  test("new profile flow writes player, profile, and session telemetry", async ({ page }) => {
    await seedStorage(page, {
      rps_welcome_pref_v1: "skip",
      rps_welcome_seen_v1: "true",
      rps_players_v1: [],
      rps_current_player_v1: "",
      rps_stats_profiles_v1: [],
      rps_current_stats_profile_v1: "",
      rps_stats_rounds_v1: [],
      rps_stats_matches_v1: [],
      rps_predictor_models_v1: [],
      rps_match_timings_v2: TIMINGS,
    });

    await page.goto("/play/profile/new");
    await page.getByLabel(/first name/i).fill("Taylor");
    await page.getByLabel(/last name initial/i).fill("Q");
    await page.getByRole("combobox").selectOption("5");
    await page.getByRole("button", { name: /save profile/i }).click();
    await page.waitForURL("**/play/training");

    await waitForTelemetryAction(page, "player-created");
    await waitForTelemetryAction(page, "profile-created");
    await waitForTelemetryAction(page, "session-started");

    const telemetry = await readTelemetry(page);
    expect(Object.keys(telemetry.playersById ?? {})).toHaveLength(1);
    expect(Object.keys(telemetry.sessionsById ?? {})).toHaveLength(1);

    const events = Object.values(telemetry.uiEventsById ?? {}) as Array<{ action?: string; profileId?: string | null }>;
    expect(events.some(event => event.action === "player-created")).toBeTruthy();
    expect(events.some(event => event.action === "profile-created" && event.profileId)).toBeTruthy();
    expect(events.some(event => event.action === "session-started")).toBeTruthy();
  });

  test("restore flow writes restore telemetry", async ({ page }) => {
    const playerId = "plr-restore";
    const profileId = "profile-restore";
    const timestamp = "2026-04-02T12:00:00.000Z";

    await seedStorage(page, {
      rps_welcome_pref_v1: "skip",
      rps_welcome_seen_v1: "true",
      rps_players_v1: [basePlayer(playerId, "Restore Tester", timestamp)],
      rps_current_player_v1: "",
      rps_stats_profiles_v1: [baseProfile(profileId, playerId, timestamp)],
      rps_current_stats_profile_v1: "",
      rps_stats_rounds_v1: [],
      rps_stats_matches_v1: [],
      rps_predictor_models_v1: [],
      rps_match_timings_v2: TIMINGS,
    });

    await page.goto("/play/profile/restore");
    await page.getByRole("button", { name: /continue to play/i }).click();
    await page.waitForURL("**/play/dashboard");

    const telemetry = await readTelemetry(page);
    const events = Object.values(telemetry.uiEventsById ?? {}) as Array<{ action?: string }>;
    expect(events.some(event => event.action === "player-restored")).toBeTruthy();
    expect(events.some(event => event.action === "session-started")).toBeTruthy();
  });

  test("deleting a player and onboarding a new one starts a fresh session again", async ({ page }) => {
    const originalPlayerId = "plr-delete-session-old";
    const originalProfileId = "profile-delete-session-old";
    const timestamp = "2026-04-02T12:00:00.000Z";

    await seedStorage(page, {
      rps_welcome_pref_v1: "skip",
      rps_welcome_seen_v1: "true",
      rps_players_v1: [basePlayer(originalPlayerId, "Delete Session Tester", timestamp)],
      rps_current_player_v1: originalPlayerId,
      rps_stats_profiles_v1: [baseProfile(originalProfileId, originalPlayerId, timestamp)],
      rps_current_stats_profile_v1: originalProfileId,
      rps_stats_rounds_v1: [],
      rps_stats_matches_v1: [],
      rps_predictor_models_v1: [],
      rps_match_timings_v2: TIMINGS,
    });

    await page.goto("/play/dashboard");
    await waitForTelemetryAction(page, "session-started");

    await unlockDeveloperPage(page);
    await page.getByRole("button", { name: /delete session tester/i }).first().click();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: /^delete player$/i }).click();

    await expect.poll(async () => {
      const telemetry = await readTelemetry(page);
      return Object.keys(telemetry.sessionsById ?? {}).length;
    }, { timeout: 10_000 }).toBe(0);

    await page.goto("/play/profile/new");
    await page.getByLabel(/first name/i).fill("Jamie");
    await page.getByLabel(/last name initial/i).fill("R");
    await page.getByRole("combobox").selectOption("5");
    await page.getByRole("button", { name: /save profile/i }).click();
    await page.waitForURL("**/play/training");

    const rock = page.getByTestId("training-controls-option-rock");
    await expect(rock).toBeVisible();
    await expect(rock).toBeEnabled();
    await rock.click();
    await page.waitForTimeout(900);

    const telemetry = await readTelemetry(page);
    const sessions = Object.values(telemetry.sessionsById ?? {}) as Array<{ playerId?: string; profileId?: string; status?: string }>;
    const rounds = Object.values(telemetry.roundsById ?? {}) as Array<{ playerId?: string; profileId?: string; mode?: string }>;
    const events = Object.values(telemetry.uiEventsById ?? {}) as Array<{ action?: string; playerId?: string; profileId?: string | null }>;

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.status).toBe("active");
    expect(rounds.some(round => round.mode === "training")).toBeTruthy();
    expect(events.some(event => event.action === "session-started" && event.playerId === sessions[0]?.playerId)).toBeTruthy();
  });

  test("training match writes completed practice match, rounds, and predictions", async ({ page }) => {
    const playerId = "plr-training";
    const profileId = "profile-training";
    const timestamp = "2026-04-02T12:00:00.000Z";

    await seedStorage(page, {
      rps_welcome_pref_v1: "skip",
      rps_welcome_seen_v1: "true",
      rps_players_v1: [basePlayer(playerId, "Training Tester", timestamp)],
      rps_current_player_v1: playerId,
      rps_stats_profiles_v1: [baseProfile(profileId, playerId, timestamp, {
        trainingCount: 0,
        trained: false,
        predictorDefault: false,
        seenPostTrainingCTA: false,
        preferences: {
          theme: "dark",
          themeColors: {
            light: { accent: "#2563EB", background: "#F6F8FC" },
            dark: { accent: "#60A5FA", background: "#0B1220" },
          },
          gameplay: { aiDifficulty: "normal", bestOf: 5 },
        },
      })],
      rps_current_stats_profile_v1: profileId,
      rps_stats_rounds_v1: [],
      rps_stats_matches_v1: [],
      rps_predictor_models_v1: [],
      rps_match_timings_v2: TIMINGS,
    });

    await page.goto("/play/training");
    await finishTrainingRun(page);
    await page.waitForURL("**/play/dashboard", { timeout: 15_000 });

    const telemetry = await readTelemetry(page);
    const matches = Object.values(telemetry.matchesById ?? {}) as Array<{ mode?: string; status?: string; roundsPlayed?: number }>;
    const rounds = Object.values(telemetry.roundsById ?? {}) as Array<{ mode?: string }>;
    const predictions = Object.values(telemetry.predictionsById ?? {}) as Array<{ roundId?: string }>;

    expect(matches.some(match => match.mode === "practice" && match.status === "completed" && match.roundsPlayed === 5)).toBeTruthy();
    expect(rounds.filter(round => round.mode === "practice")).toHaveLength(5);
    expect(predictions.length).toBeGreaterThanOrEqual(5);
  });

  test("challenge completion and rematch keep match IDs linked correctly", async ({ page }) => {
    const playerId = "plr-challenge";
    const profileId = "profile-challenge";
    const timestamp = "2026-04-02T12:00:00.000Z";

    await seedStorage(page, {
      rps_welcome_pref_v1: "skip",
      rps_welcome_seen_v1: "true",
      rps_players_v1: [basePlayer(playerId, "Challenge Tester", timestamp)],
      rps_current_player_v1: playerId,
      rps_stats_profiles_v1: [baseProfile(profileId, playerId, timestamp)],
      rps_current_stats_profile_v1: profileId,
      rps_stats_rounds_v1: [],
      rps_stats_matches_v1: [],
      rps_predictor_models_v1: [],
      rps_match_timings_v2: TIMINGS,
    });

    await page.goto("/play/challenge");
    await playChallengeUntilResults(page);

    const afterFirstMatch = await readTelemetry(page);
    const firstCompletedMatches = Object.values(afterFirstMatch.matchesById ?? {}) as Array<{ id?: string; mode?: string; status?: string }>;
    const firstChallengeMatch = firstCompletedMatches.find(match => match.mode === "challenge" && match.status === "completed");
    expect(firstChallengeMatch?.id).toBeTruthy();

    await page.getByRole("button", { name: /play again/i }).click();
    const rock = page.getByTestId("challenge-controls-option-rock");
    await expect(rock).toBeVisible({ timeout: 10_000 });
    await expect(rock).toBeEnabled({ timeout: 10_000 });
    await rock.click();
    await page.waitForTimeout(950);

    const telemetry = await readTelemetry(page);
    const matches = Object.values(telemetry.matchesById ?? {}) as Array<{ id?: string; mode?: string; status?: string }>;
    const rounds = Object.values(telemetry.roundsById ?? {}) as Array<{ matchId?: string; mode?: string }>;
    const predictions = Object.values(telemetry.predictionsById ?? {}) as Array<{ matchId?: string }>;
    const challengeMatches = matches.filter(match => match.mode === "challenge");

    expect(challengeMatches.length).toBeGreaterThanOrEqual(2);
    expect(challengeMatches.some(match => match.status === "completed")).toBeTruthy();
    const secondMatch = challengeMatches.find(match => match.id && match.id !== firstChallengeMatch?.id);
    expect(secondMatch?.id).toBeTruthy();
    expect(rounds.some(round => round.mode === "challenge" && round.matchId === secondMatch?.id)).toBeTruthy();
    expect(predictions.some(prediction => prediction.matchId === secondMatch?.id)).toBeTruthy();
  });

  test("unfinished training can still reach dashboard while challenge stays blocked", async ({ page }) => {
    const playerId = "plr-training-nav";
    const profileId = "profile-training-nav";
    const timestamp = "2026-04-02T12:00:00.000Z";

    await seedStorage(page, {
      rps_welcome_pref_v1: "skip",
      rps_welcome_seen_v1: "true",
      rps_players_v1: [basePlayer(playerId, "Training Nav Tester", timestamp)],
      rps_current_player_v1: playerId,
      rps_stats_profiles_v1: [baseProfile(profileId, playerId, timestamp, {
        trainingCount: 2,
        trained: false,
        predictorDefault: false,
        seenPostTrainingCTA: false,
      })],
      rps_current_stats_profile_v1: profileId,
      rps_stats_rounds_v1: [],
      rps_stats_matches_v1: [],
      rps_predictor_models_v1: [],
      rps_match_timings_v2: TIMINGS,
    });

    await page.goto("/play/dashboard");
    await page.waitForURL("**/play/dashboard");
    await expect(page.getByText(/training in progress/i)).toBeVisible();

    await page.goto("/play/challenge");
    await page.waitForURL("**/play/dashboard");
    await expect(page.getByRole("button", { name: /challenge locked/i })).toBeVisible();
  });

  test("mid-match dashboard navigation resumes the same challenge match and keeps developer count stable", async ({ page }) => {
    const playerId = "plr-resume";
    const profileId = "profile-resume";
    const timestamp = "2026-04-02T12:00:00.000Z";

    await seedStorage(page, {
      rps_welcome_pref_v1: "skip",
      rps_welcome_seen_v1: "true",
      rps_players_v1: [basePlayer(playerId, "Resume Tester", timestamp)],
      rps_current_player_v1: playerId,
      rps_stats_profiles_v1: [baseProfile(profileId, playerId, timestamp, {
        preferences: {
          theme: "dark",
          themeColors: {
            light: { accent: "#2563EB", background: "#F6F8FC" },
            dark: { accent: "#60A5FA", background: "#0B1220" },
          },
          gameplay: { aiDifficulty: "normal", bestOf: 5 },
        },
      })],
      rps_current_stats_profile_v1: profileId,
      rps_stats_rounds_v1: [],
      rps_stats_matches_v1: [],
      rps_predictor_models_v1: [],
      rps_match_timings_v2: TIMINGS,
    });

    await page.goto("/play/challenge");
    const rock = page.getByTestId("challenge-controls-option-rock");
    await expect(rock).toBeVisible();
    await expect(rock).toBeEnabled();
    await rock.click();
    await page.waitForTimeout(950);

    const telemetry = await readTelemetry(page);
    const initialMatch = (Object.values(telemetry.matchesById ?? {}) as Array<{ id?: string; mode?: string; status?: string }>)
      .find(match => match.mode === "challenge" && match.status === "active");
    expect(initialMatch?.id).toBeTruthy();

    await page.goto("/play/dashboard");
    await page.waitForURL("**/play/dashboard");
    await page.goto("/play/challenge");
    await page.waitForURL("**/play/challenge");

    const telemetryAfterReturn = await readTelemetry(page);
    const challengeMatchesAfterReturn = Object.values(telemetryAfterReturn.matchesById ?? {}) as Array<{
      id?: string;
      mode?: string;
      status?: string;
    }>;
    expect(challengeMatchesAfterReturn.filter(match => match.mode === "challenge")).toHaveLength(1);
    expect(
      challengeMatchesAfterReturn.some(match => match.id === initialMatch?.id && match.status === "active"),
    ).toBeTruthy();
    expect(challengeMatchesAfterReturn.some(match => match.mode === "challenge" && match.status === "abandoned")).toBeFalsy();

    const paper = page.getByTestId("challenge-controls-option-paper");
    await expect(paper).toBeVisible();
    await expect(paper).toBeEnabled();
    await paper.click();
    await page.waitForTimeout(950);

    const resumedTelemetry = await readTelemetry(page);
    const rounds = Object.values(resumedTelemetry.roundsById ?? {}) as Array<{ matchId?: string; mode?: string }>;
    expect(rounds.filter(round => round.mode === "challenge" && round.matchId === initialMatch?.id).length).toBeGreaterThanOrEqual(2);

    await unlockDeveloperPage(page);
    await page.getByRole("button", { name: /overview/i }).click();
    await expect(page.getByTestId("developer-stat-matches").locator("strong")).toHaveText("1");
  });

  test("developer export workflow downloads the full structured telemetry set", async ({ page }) => {
    const playerId = "plr-export";
    const profileId = "profile-export";
    const timestamp = "2026-04-02T12:00:00.000Z";
    const seededMatchId = "match-export";
    const seededRoundId = "round-export";

    await seedStorage(page, {
      rps_welcome_pref_v1: "skip",
      rps_welcome_seen_v1: "true",
      rps_players_v1: [basePlayer(playerId, "Export Tester", timestamp)],
      rps_current_player_v1: playerId,
      rps_stats_profiles_v1: [baseProfile(profileId, playerId, timestamp)],
      rps_current_stats_profile_v1: profileId,
      rps_stats_rounds_v1: [
        {
          id: seededRoundId,
          sessionId: "sess-export",
          matchId: seededMatchId,
          playerId,
          profileId,
          t: timestamp,
          mode: "challenge",
          bestOf: 3,
          difficulty: "normal",
          player: "rock",
          ai: "paper",
          outcome: "lose",
          policy: "mixer",
          confidence: 0.42,
          confidenceBucket: "medium",
          reason: "Seed round",
          streakAI: 1,
          streakYou: 0,
          decisionTimeMs: 800,
          mixer: {
            dist: { rock: 0.5, paper: 0.25, scissors: 0.25 },
            counter: "paper",
            topExperts: [{ name: "FrequencyExpert", weight: 0.4 }],
            confidence: 0.42,
            realtimeWeight: 0.6,
            historyWeight: 0.4,
            realtimeRounds: 3,
            historyRounds: 2,
            conflict: { realtime: "rock", history: "paper" },
          },
        },
      ],
      rps_stats_matches_v1: [
        {
          id: "match-summary-export",
          clientId: seededMatchId,
          sessionId: "sess-export",
          playerId,
          profileId,
          startedAt: timestamp,
          endedAt: "2026-04-02T12:00:10.000Z",
          mode: "challenge",
          bestOf: 3,
          difficulty: "normal",
          score: { you: 0, ai: 1 },
          rounds: 1,
          aiWinRate: 1,
          youSwitchedRate: 0,
        },
      ],
      rps_predictor_models_v1: [],
      rps_match_timings_v2: TIMINGS,
    });

    await unlockDeveloperPage(page);

    const downloads: Download[] = [];
    page.on("download", download => {
      downloads.push(download);
    });

    await page.getByTestId("download-all-telemetry-csvs").click();
    await expect.poll(() => downloads.length, { timeout: 10_000 }).toBe(6);

    const filenames = await Promise.all(downloads.map(download => download.suggestedFilename()));
    expect(new Set(filenames)).toEqual(new Set([
      "rps-telemetry-profiles.csv",
      "rps-telemetry-sessions.csv",
      "rps-telemetry-matches.csv",
      "rps-telemetry-rounds.csv",
      "rps-telemetry-predictions.csv",
      "rps-telemetry-events.csv",
    ]));

    const telemetry = await readTelemetry(page);
    const events = Object.values(telemetry.uiEventsById ?? {}) as Array<{ action?: string }>;
    expect(events.some(event => event.action === "telemetry-export-all-downloaded")).toBeTruthy();
  });

  test("fresh end-to-end run produces sane developer counts", async ({ page }) => {
    const timestamp = "2026-04-02T12:00:00.000Z";

    await seedStorage(page, {
      rps_welcome_pref_v1: "skip",
      rps_welcome_seen_v1: "true",
      rps_players_v1: [],
      rps_current_player_v1: "",
      rps_stats_profiles_v1: [],
      rps_current_stats_profile_v1: "",
      rps_stats_rounds_v1: [],
      rps_stats_matches_v1: [],
      rps_predictor_models_v1: [],
      rps_match_timings_v2: TIMINGS,
    });

    await page.goto("/play/profile/new");
    await page.getByLabel(/first name/i).fill("Casey");
    await page.getByLabel(/last name initial/i).fill("T");
    await page.getByRole("combobox").selectOption("5");
    await page.getByRole("button", { name: /save profile/i }).click();
    await page.waitForURL("**/play/training");

    await finishTrainingRun(page);
    await page.waitForURL("**/play/dashboard", { timeout: 15_000 });

    await page.goto("/play/challenge");
    await playChallengeUntilResults(page);
    await page.getByRole("button", { name: /play again/i }).click();
    await expect(page.getByTestId("challenge-controls-option-paper")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("challenge-controls-option-paper").click();
    await page.waitForTimeout(250);
    await page.goto("/play/dashboard");
    await page.waitForLoadState("networkidle");

    await unlockDeveloperPage(page);
    await page.getByRole("button", { name: /overview/i }).click();
    const beforeRefreshTelemetry = await readTelemetry(page);
    const beforeRefreshCounts = {
      players: Object.keys(beforeRefreshTelemetry.playersById ?? {}).length,
      sessions: Object.keys(beforeRefreshTelemetry.sessionsById ?? {}).length,
      matches: Object.keys(beforeRefreshTelemetry.matchesById ?? {}).length,
      rounds: Object.keys(beforeRefreshTelemetry.roundsById ?? {}).length,
      predictions: Object.keys(beforeRefreshTelemetry.predictionsById ?? {}).length,
      events: Object.keys(beforeRefreshTelemetry.uiEventsById ?? {}).length,
    };

    expect(beforeRefreshCounts.players).toBe(1);
    expect(beforeRefreshCounts.matches).toBeLessThanOrEqual(beforeRefreshCounts.rounds + 3);
    expect(beforeRefreshCounts.rounds).toBeGreaterThanOrEqual(5);

    await page.reload();
    await page.getByLabel(/^PIN$/i).fill(DEV_PIN);
    await page.getByRole("button", { name: /^unlock$/i }).click();
    await page.getByRole("button", { name: /overview/i }).click();

    const afterRefreshTelemetry = await readTelemetry(page);
    const afterRefreshCounts = {
      players: Object.keys(afterRefreshTelemetry.playersById ?? {}).length,
      sessions: Object.keys(afterRefreshTelemetry.sessionsById ?? {}).length,
      matches: Object.keys(afterRefreshTelemetry.matchesById ?? {}).length,
      rounds: Object.keys(afterRefreshTelemetry.roundsById ?? {}).length,
      predictions: Object.keys(afterRefreshTelemetry.predictionsById ?? {}).length,
      events: Object.keys(afterRefreshTelemetry.uiEventsById ?? {}).length,
    };

    expect(afterRefreshCounts.matches).toBe(beforeRefreshCounts.matches);
    expect(afterRefreshCounts.rounds).toBe(beforeRefreshCounts.rounds);

    await writeFile(
      "test-results/layout/telemetry-observed-counts.json",
      JSON.stringify(
        {
          generatedAt: timestamp,
          beforeRefreshCounts,
          afterRefreshCounts,
        },
        null,
        2,
      ),
      "utf8",
    );
  });
});
