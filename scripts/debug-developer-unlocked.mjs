import { chromium } from "@playwright/test";

const BASE_URL = process.env.DEBUG_URL_BASE ?? "http://host.docker.internal:4174";
const DEV_PIN = "02853Adam/@";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1264, height: 578 } });
const page = await context.newPage();

await page.addInitScript(() => {
  window.localStorage.clear();
  window.localStorage.setItem("rps_welcome_pref_v1", "skip");
  window.localStorage.setItem("rps_welcome_seen_v1", "true");
  const player = {
    id: "plr-debug-dev",
    playerName: "Debug D.",
    grade: "5",
    consent: { agreed: true, timestamp: new Date().toISOString(), consentTextVersion: "v1" },
    needsReview: false,
  };
  const profile = {
    id: "profile-debug-dev",
    playerId: "plr-debug-dev",
    name: "primary",
    baseName: "primary",
    createdAt: new Date().toISOString(),
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
      gameplay: { aiDifficulty: "normal", bestOf: 5 },
    },
  };
  window.localStorage.setItem("rps_players_v1", JSON.stringify([player]));
  window.localStorage.setItem("rps_current_player_v1", player.id);
  window.localStorage.setItem("rps_stats_profiles_v1", JSON.stringify([profile]));
  window.localStorage.setItem("rps_current_stats_profile_v1", profile.id);
  window.localStorage.setItem("rps_stats_rounds_v1", JSON.stringify([]));
  window.localStorage.setItem("rps_stats_matches_v1", JSON.stringify([]));
  window.localStorage.setItem("rps_predictor_models_v1", JSON.stringify([]));
});

await page.goto(`${BASE_URL}/play/developer`, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForURL("**/play/developer", { timeout: 15000 }).catch(() => {});
const pin = page.getByLabel(/^PIN$/i);
if (await pin.isVisible().catch(() => false)) {
  await pin.fill(DEV_PIN);
  await page.getByRole("button", { name: /^unlock$/i }).click();
}
await page.waitForTimeout(3000);
console.log(`[url] ${page.url()}`);
console.log("[body]");
console.log(await page.locator("body").innerText());

await browser.close();
