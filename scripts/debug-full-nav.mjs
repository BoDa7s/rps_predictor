import { chromium } from "@playwright/test";

const BASE_URL = process.env.DEBUG_URL_BASE ?? "http://host.docker.internal:4174";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1264, height: 578 } });
const page = await context.newPage();

await page.addInitScript(() => {
  window.localStorage.clear();
  window.localStorage.setItem("rps_welcome_pref_v1", "skip");
  window.localStorage.setItem("rps_welcome_seen_v1", "true");
  window.localStorage.setItem("rps_players_v1", JSON.stringify([]));
  window.localStorage.setItem("rps_current_player_v1", "");
  window.localStorage.setItem("rps_stats_profiles_v1", JSON.stringify([]));
  window.localStorage.setItem("rps_current_stats_profile_v1", "");
  window.localStorage.setItem("rps_stats_rounds_v1", JSON.stringify([]));
  window.localStorage.setItem("rps_stats_matches_v1", JSON.stringify([]));
  window.localStorage.setItem("rps_predictor_models_v1", JSON.stringify([]));
  window.localStorage.setItem(
    "rps_match_timings_v2",
    JSON.stringify({
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
    }),
  );
});

await page.goto(`${BASE_URL}/play/profile/new`, { waitUntil: "networkidle", timeout: 30000 });
await page.getByLabel(/first name/i).fill("Casey");
await page.getByLabel(/last name initial/i).fill("T");
await page.getByRole("combobox").selectOption("5");
await page.getByRole("button", { name: /save profile/i }).click();
await page.waitForURL("**/play/training", { timeout: 15000 });

for (let index = 0; index < 5; index += 1) {
  await page.getByRole("button", { name: /^rock/i }).first().click();
  await page.waitForTimeout(900);
}

await page.waitForURL("**/play/dashboard", { timeout: 15000 });
await page.getByRole("button", { name: /launch challenge/i }).click();
await page.waitForURL("**/play/challenge", { timeout: 15000 });

for (let index = 0; index < 9; index += 1) {
  const playAgainButton = page.getByRole("button", { name: /play again/i });
  if (await playAgainButton.isVisible().catch(() => false)) break;
  await page.getByRole("button", { name: /^rock/i }).first().click();
  await page.waitForTimeout(1000);
}

await page.getByRole("button", { name: /play again/i }).click();
await page.getByRole("button", { name: /^paper/i }).first().click();
await page.waitForTimeout(1000);
await page.goto(`${BASE_URL}/play/dashboard`);
await page.waitForURL("**/play/dashboard", { timeout: 15000 });
await page.waitForTimeout(1000);
console.log("[dashboard-after-abandon]");
console.log(await page.locator("body").innerText());
await page.getByRole("button", { name: /open player menu/i }).click();
await page.getByRole("menuitem", { name: /developer mode/i }).click();
await page.waitForTimeout(5000);

console.log(`[url] ${page.url()}`);
console.log("[body]");
console.log(await page.locator("body").innerText());
console.log("[telemetry-counts]");
const telemetry = await page.evaluate(() => JSON.parse(window.localStorage.getItem("rps_telemetry_v1") ?? "{}"));
console.log(JSON.stringify({
  players: Object.keys(telemetry.playersById ?? {}).length,
  sessions: Object.keys(telemetry.sessionsById ?? {}).length,
  matches: Object.keys(telemetry.matchesById ?? {}).length,
  rounds: Object.keys(telemetry.roundsById ?? {}).length,
  predictions: Object.keys(telemetry.predictionsById ?? {}).length,
  events: Object.keys(telemetry.uiEventsById ?? {}).length,
}, null, 2));

await browser.close();
