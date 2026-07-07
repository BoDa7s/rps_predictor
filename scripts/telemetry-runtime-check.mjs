import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const BASE_URL = process.env.TELEMETRY_BASE_URL ?? "http://127.0.0.1:4174";
const OUTPUT_PATH = path.resolve("test-results/layout/telemetry-observed-counts.json");
const DEV_AUTOMATION_UNLOCK = "codex-telemetry-check";
const VIEWPORT = { width: 1264, height: 578 };

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

function basePlayer(playerId, playerName, timestamp) {
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

function baseProfile(profileId, playerId, timestamp, overrides = {}) {
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

async function primeLocalStorage(page, seed) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(data => {
    window.localStorage.clear();
    Object.entries(data).forEach(([key, value]) => {
      window.localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    });
  }, seed);
}

async function readTelemetry(page) {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem("rps_telemetry_v1") ?? "{}"));
}

async function snapshotLocalStorage(page) {
  return page.evaluate(() => {
    const entries = {};
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      entries[key] = window.localStorage.getItem(key) ?? "";
    }
    return entries;
  });
}

function summarizeTelemetry(telemetry) {
  const matches = Object.values(telemetry.matchesById ?? {});
  const rounds = Object.values(telemetry.roundsById ?? {});
  const predictions = Object.values(telemetry.predictionsById ?? {});
  return {
    players: Object.keys(telemetry.playersById ?? {}).length,
    sessions: Object.keys(telemetry.sessionsById ?? {}).length,
    matches: matches.length,
    completedMatches: matches.filter(record => record?.completed).length,
    completedChallengeMatches: matches.filter(record => record?.completed && record?.mode === "challenge").length,
    rounds: rounds.length,
    predictions: predictions.length,
    challengePredictions: predictions.filter(record => record?.mode === "challenge").length,
    events: Object.keys(telemetry.uiEventsById ?? {}).length,
  };
}

function collectModes(telemetry) {
  return {
    matchModes: Array.from(new Set(Object.values(telemetry.matchesById ?? {}).map(record => record?.mode).filter(Boolean))).sort(),
    roundModes: Array.from(new Set(Object.values(telemetry.roundsById ?? {}).map(record => record?.mode).filter(Boolean))).sort(),
    predictionModes: Array.from(new Set(Object.values(telemetry.predictionsById ?? {}).map(record => record?.mode).filter(Boolean))).sort(),
  };
}

async function finishTrainingRun(page) {
  for (let index = 0; index < 5; index += 1) {
    const rock = page.getByRole("button", { name: /^rock/i }).first();
    await rock.waitFor({ state: "visible", timeout: 10000 });
    await rock.click();
    await page.waitForTimeout(900);
  }
}

async function playChallengeUntilResults(page) {
  for (let index = 0; index < 9; index += 1) {
    const playAgainButton = page.getByRole("button", { name: /play again/i });
    if (await playAgainButton.isVisible().catch(() => false)) {
      return;
    }
    const rock = page.getByRole("button", { name: /^rock/i }).first();
    await rock.waitFor({ state: "visible", timeout: 10000 });
    await rock.click();
    await page.waitForTimeout(1000);
  }
  await page.getByRole("button", { name: /play again/i }).waitFor({ state: "visible", timeout: 10000 });
}

async function unlockDeveloperPage(page) {
  const playerMenuButton = page.getByRole("button", { name: /open player menu/i });
  if (!(await playerMenuButton.isVisible().catch(() => false))) {
    const bodyText = await page.locator("body").innerText();
    throw new Error(`Player menu trigger missing before opening developer page at ${page.url()}\n${bodyText.slice(0, 1200)}`);
  }
  await playerMenuButton.click();
  await page.getByRole("menuitem", { name: /developer mode/i }).click();
  await expect
    .poll(() => {
      try {
        return new URL(page.url()).pathname;
      } catch {
        return page.url();
      }
    }, { timeout: 15000 })
    .toBe("/play/developer");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
  const exportPanel = page.getByTestId("telemetry-export-panel");
  if (await exportPanel.isVisible().catch(() => false)) {
    return;
  }
  const diagnostics = await page.evaluate(() => ({
    href: window.location.href,
    isSecureContext: window.isSecureContext,
    hasSubtle: !!window.crypto?.subtle,
    webdriver: navigator.webdriver,
    automationBootstrap: window.localStorage.getItem("rps_dev_automation_unlock_v1"),
    bodyText: document.body.innerText,
  }));
  throw new Error(`Developer automation unlock failed\n${JSON.stringify(diagnostics, null, 2)}`);
}

async function readDeveloperOverview(page) {
  const overviewTab = page.getByRole("button", { name: /^overview$/i });
  if (await overviewTab.isVisible().catch(() => false)) {
    await overviewTab.click();
  }
  await page.waitForTimeout(300);
  const playersCard = page.getByTestId("developer-stat-players").locator("strong");
  if (await playersCard.isVisible().catch(() => false)) {
    return {
      players: Number(await playersCard.innerText()),
      profiles: Number(await page.getByTestId("developer-stat-profiles").locator("strong").innerText()),
      matches: Number(await page.getByTestId("developer-stat-matches").locator("strong").innerText()),
      rounds: Number(await page.getByTestId("developer-stat-rounds").locator("strong").innerText()),
    };
  }
  const bodyText = await page.locator("body").innerText();
  const match = bodyText.match(/Players\s+(\d+)\s+Profiles\s+(\d+)\s+Matches\s+(\d+)\s+Rounds\s+(\d+)/is);
  return {
    players: match ? Number(match[1]) : null,
    profiles: match ? Number(match[2]) : null,
    matches: match ? Number(match[3]) : null,
    rounds: match ? Number(match[4]) : null,
    bodyText,
  };
}

async function readStatsOverview(page) {
  await page.goto(`${BASE_URL}/play/stats`);
  await page.waitForLoadState("networkidle");
  const card = page.getByTestId("stats-match-count");
  if (await card.isVisible().catch(() => false)) {
    return {
      matchCount: Number(await card.innerText()),
    };
  }
  const bodyText = await page.locator("body").innerText();
  const match = bodyText.match(/Match Count\s+(\d+)/i);
  return {
    matchCount: match ? Number(match[1]) : null,
    bodyText,
  };
}

async function readLeaderboardOverview(page) {
  await page.goto(`${BASE_URL}/play/leaderboard`);
  await page.waitForLoadState("networkidle");
  const card = page.getByTestId("leaderboard-ranked-sessions");
  if (await card.isVisible().catch(() => false)) {
    return {
      rankedSessions: Number(await card.innerText()),
    };
  }
  const bodyText = await page.locator("body").innerText();
  const match = bodyText.match(/Ranked Sessions\s+(\d+)/i);
  return {
    rankedSessions: match ? Number(match[1]) : null,
    bodyText,
  };
}

async function runFreshScenario(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  await primeLocalStorage(page, {
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
    rps_dev_automation_unlock_v1: DEV_AUTOMATION_UNLOCK,
  });

  await page.goto(`${BASE_URL}/play/profile/new`);
  await page.getByLabel(/first name/i).fill("Casey");
  await page.getByLabel(/last name initial/i).fill("T");
  await page.getByRole("combobox").selectOption("5");
  await page.getByRole("button", { name: /save profile/i }).click();
  await page.waitForURL("**/play/training", { timeout: 15000 });

  await finishTrainingRun(page);
  await page.waitForURL("**/play/dashboard", { timeout: 15000 });

  await page.getByRole("button", { name: /launch challenge/i }).click();
  await page.waitForURL("**/play/challenge", { timeout: 15000 });
  await playChallengeUntilResults(page);

  const playAgain = page.getByRole("button", { name: /play again/i });
  await playAgain.click();
  const paper = page.getByRole("button", { name: /^paper/i }).first();
  await paper.waitFor({ state: "visible", timeout: 10000 });
  await paper.click();
  await page.waitForTimeout(1000);
  const telemetryBeforeLeave = await readTelemetry(page);
  const activeChallengeMatchBeforeLeave = Object.values(telemetryBeforeLeave.matchesById ?? {}).find(
    record => record?.mode === "challenge" && record?.status === "active",
  );
  await page.getByRole("link", { name: /^dashboard$/i }).first().click();
  await page.waitForURL("**/play/dashboard", { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: /launch challenge/i }).click();
  await page.waitForURL("**/play/challenge", { timeout: 15000 });
  await page.waitForTimeout(500);
  const telemetryAfterReturn = await readTelemetry(page);
  const activeChallengeMatchAfterReturn = Object.values(telemetryAfterReturn.matchesById ?? {}).find(
    record => record?.mode === "challenge" && record?.status === "active",
  );
  await page.getByRole("link", { name: /^dashboard$/i }).first().click();
  await page.waitForURL("**/play/dashboard", { timeout: 15000 });
  await page.waitForTimeout(500);

  const statsBeforeRefresh = await readStatsOverview(page);
  const leaderboardBeforeRefresh = await readLeaderboardOverview(page);

  await unlockDeveloperPage(page);
  await page.evaluate(() => {
    window.location.hash = "tab=overview";
  });
  await page.waitForTimeout(750);

  const beforeRefreshTelemetry = await readTelemetry(page);
  const beforeRefreshCounts = summarizeTelemetry(beforeRefreshTelemetry);
  const beforeRefreshModes = collectModes(beforeRefreshTelemetry);
  const developerOverviewBeforeRefresh = await readDeveloperOverview(page);
  const persistedStorage = await snapshotLocalStorage(page);
  await context.close();

  const reopenedContext = await browser.newContext({ viewport: VIEWPORT });
  const reopenedPage = await reopenedContext.newPage();
  await primeLocalStorage(reopenedPage, persistedStorage);

  const statsAfterRefresh = await readStatsOverview(reopenedPage);
  const leaderboardAfterRefresh = await readLeaderboardOverview(reopenedPage);

  await unlockDeveloperPage(reopenedPage);
  await reopenedPage.evaluate(() => {
    window.location.hash = "tab=overview";
  });
  await reopenedPage.waitForTimeout(750);

  const afterRefreshTelemetry = await readTelemetry(reopenedPage);
  const afterRefreshCounts = summarizeTelemetry(afterRefreshTelemetry);
  const afterRefreshModes = collectModes(afterRefreshTelemetry);
  const developerOverviewAfterRefresh = await readDeveloperOverview(reopenedPage);

  await reopenedContext.close();

  return {
    beforeRefreshCounts,
    beforeRefreshModes,
    resumeLifecycle: {
      activeChallengeMatchBeforeLeave: activeChallengeMatchBeforeLeave?.id ?? null,
      activeChallengeMatchAfterReturn: activeChallengeMatchAfterReturn?.id ?? null,
      abandonedChallengeMatchesAfterReturn: Object.values(telemetryAfterReturn.matchesById ?? {}).filter(
        record => record?.mode === "challenge" && record?.status === "abandoned",
      ).length,
    },
    statsBeforeRefresh,
    leaderboardBeforeRefresh,
    afterRefreshCounts,
    afterRefreshModes,
    statsAfterRefresh,
    leaderboardAfterRefresh,
    developerOverviewBeforeRefresh,
    developerOverviewAfterRefresh,
  };
}

async function runRestoreScenario(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const playerId = "plr-restore-check";
  const profileId = "profile-restore-check";
  const timestamp = "2026-04-02T12:00:00.000Z";

  await primeLocalStorage(page, {
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
    rps_dev_automation_unlock_v1: DEV_AUTOMATION_UNLOCK,
  });

  await page.goto(`${BASE_URL}/play/profile/restore`);
  await page.getByRole("button", { name: /continue to play/i }).click();
  await page.waitForURL("**/play/dashboard", { timeout: 15000 });

  const telemetry = await readTelemetry(page);
  const uiEvents = Object.values(telemetry.uiEventsById ?? {});

  await context.close();

  return {
    counts: summarizeTelemetry(telemetry),
    modes: collectModes(telemetry),
    restoreEventFound: uiEvents.some(event => event?.action === "player-restored"),
    sessionStartedFound: uiEvents.some(event => event?.action === "session-started"),
  };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: [`--unsafely-treat-insecure-origin-as-secure=${BASE_URL}`],
  });
  try {
    const freshScenario = await runFreshScenario(browser);
    const restoreScenario = await runRestoreScenario(browser);

    const payload = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      viewport: VIEWPORT,
      freshScenario,
      restoreScenario,
    };

    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf8");
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
