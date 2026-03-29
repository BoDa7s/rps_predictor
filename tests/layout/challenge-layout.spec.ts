import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const gameplayMoves = ["Rock", "Paper", "Scissors"] as const;
const challengePath = "/play/challenge";

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
}

function buildChallengeStorageSeed() {
  const playerId = "plr-layout";
  const profileId = "profile-layout";
  const timestamp = "2026-03-27T12:00:00.000Z";

  return {
    players: [
      {
        id: playerId,
        playerName: "Layout Tester",
        grade: "Not applicable",
        school: "Viewport Lab",
        priorExperience: "Automated layout checks",
        consent: {
          agreed: true,
          timestamp,
          consentTextVersion: "v1",
        },
        needsReview: false,
      },
    ],
    currentPlayerId: playerId,
    profiles: [
      {
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
        },
      },
    ],
    currentProfileId: profileId,
    timings: {
      challenge: {
        countdownTickMs: 120,
        revealHoldMs: 700,
        resultBannerMs: 5000,
        robotRoundReactionMs: 10000,
        robotRoundRestMs: 120000,
        robotResultReactionMs: 10000,
        robotResultRestMs: 120000,
      },
      practice: {
        countdownTickMs: 800,
        revealHoldMs: 1600,
        resultBannerMs: 1600,
        robotRoundReactionMs: 10000,
        robotRoundRestMs: 120000,
        robotResultReactionMs: 10000,
        robotResultRestMs: 120000,
      },
    },
  };
}

async function seedChallengeState(page: Page) {
  const storageSeed = buildChallengeStorageSeed();

  await page.addInitScript(seed => {
    window.localStorage.clear();
    window.localStorage.setItem("rps_welcome_pref_v1", "skip");
    window.localStorage.setItem("rps_welcome_seen_v1", "true");
    window.localStorage.setItem("rps_players_v1", JSON.stringify(seed.players));
    window.localStorage.setItem("rps_current_player_v1", seed.currentPlayerId);
    window.localStorage.setItem("rps_stats_profiles_v1", JSON.stringify(seed.profiles));
    window.localStorage.setItem("rps_current_stats_profile_v1", seed.currentProfileId);
    window.localStorage.setItem("rps_stats_rounds_v1", JSON.stringify([]));
    window.localStorage.setItem("rps_stats_matches_v1", JSON.stringify([]));
    window.localStorage.setItem("rps_predictor_models_v1", JSON.stringify([]));
    window.localStorage.setItem("rps_match_timings_v1", JSON.stringify(seed.timings));
  }, storageSeed);
}

async function expectRectInsideViewport(page: Page, locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} should have a measurable bounding box`).not.toBeNull();
  if (!box) return;

  const viewport = page.viewportSize();
  expect(viewport, "viewport should be available").not.toBeNull();
  if (!viewport) return;

  expect(box.x, `${label} left edge should be visible`).toBeGreaterThanOrEqual(-1);
  expect(box.y, `${label} top edge should be visible`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${label} right edge should be visible`).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height, `${label} bottom edge should be visible`).toBeLessThanOrEqual(viewport.height + 1);
}

async function expectRectInsideRegion(parent: Locator, child: Locator, label: string) {
  await expect(parent, `${label} parent should be visible before measuring`).toBeVisible();
  await expect(child, `${label} should be visible before measuring`).toBeVisible();

  const parentBox = await parent.boundingBox();
  const childBox = await child.boundingBox();
  expect(parentBox, `${label} parent should have a measurable bounding box`).not.toBeNull();
  expect(childBox, `${label} should have a measurable bounding box`).not.toBeNull();
  if (!parentBox || !childBox) return;

  expect(childBox.x, `${label} left edge should stay inside its parent`).toBeGreaterThanOrEqual(parentBox.x - 1);
  expect(childBox.y, `${label} top edge should stay inside its parent`).toBeGreaterThanOrEqual(parentBox.y - 1);
  expect(childBox.x + childBox.width, `${label} right edge should stay inside its parent`).toBeLessThanOrEqual(
    parentBox.x + parentBox.width + 1,
  );
  expect(childBox.y + childBox.height, `${label} bottom edge should stay inside its parent`).toBeLessThanOrEqual(
    parentBox.y + parentBox.height + 1,
  );
}

async function expectNoVerticalOverflow(locator: Locator, label: string) {
  const metrics = await locator.evaluate(node => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
  }));

  expect(metrics.scrollHeight, `${label} should not vertically overflow`).toBeLessThanOrEqual(metrics.clientHeight + 1);
}

async function expectNoHorizontalOverflow(locator: Locator, label: string) {
  const metrics = await locator.evaluate(node => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));

  expect(metrics.scrollWidth, `${label} should not horizontally overflow`).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function expectMinHeight(locator: Locator, label: string, minHeight: number) {
  await expect(locator, `${label} should be visible before measuring`).toBeVisible();
  let box = await locator.boundingBox();
  if (!box) {
    await locator.page().waitForTimeout(60);
    box = await locator.boundingBox();
  }
  expect(box, `${label} should have a measurable bounding box`).not.toBeNull();
  if (!box) return;

  expect(box.height, `${label} should remain tall enough to be readable`).toBeGreaterThanOrEqual(minHeight - 1);
}

async function expectMinWidth(locator: Locator, label: string, minWidth: number) {
  await expect(locator, `${label} should be visible before measuring`).toBeVisible();
  let box = await locator.boundingBox();
  if (!box) {
    await locator.page().waitForTimeout(60);
    box = await locator.boundingBox();
  }
  expect(box, `${label} should have a measurable bounding box`).not.toBeNull();
  if (!box) return;

  expect(box.width, `${label} should remain wide enough to be readable`).toBeGreaterThanOrEqual(minWidth);
}

async function expectMinFontSize(locator: Locator, label: string, minSize: number) {
  const readFontSize = async () =>
    locator.evaluate(node => {
      const computed = window.getComputedStyle(node);
      const directValue = Number.parseFloat(computed.fontSize);
      if (Number.isFinite(directValue)) {
        return directValue;
      }

    const styleMapSize = "computedStyleMap" in node && typeof node.computedStyleMap === "function"
      ? node.computedStyleMap().get("font-size")
      : null;
    if (styleMapSize && "value" in styleMapSize && typeof styleMapSize.value === "number") {
      return styleMapSize.value;
    }

      const rect = node.getBoundingClientRect();
      return rect.height * 0.55;
    });

  await expect(locator, `${label} should be visible before measuring`).toBeVisible();
  let fontSize = await readFontSize();
  if (!Number.isFinite(fontSize) || fontSize < 1) {
    await locator.page().waitForTimeout(60);
    fontSize = await readFontSize();
  }
  if (!Number.isFinite(fontSize) || fontSize < 1) {
    const box = await locator.boundingBox();
    if (box) {
      fontSize = box.height * 0.55;
    }
  }
  expect(fontSize, `${label} should stay above the minimum readable font size`).toBeGreaterThanOrEqual(minSize - 0.5);
}

async function expectPageFitsViewport(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));

  expect(metrics.scrollWidth, "page should not overflow horizontally").toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.scrollHeight, "page should not overflow vertically").toBeLessThanOrEqual(metrics.viewportHeight + 1);
}

function getReadabilityThresholds(viewportHeight: number) {
  if (viewportHeight >= 1000) {
    return {
      centerRingMin: 96,
      centerTitleFontMin: 28,
      sidePaneMin: 220,
      controlCardMin: 86,
      controlLabelFontMin: 18,
      aiValueFontMin: 16,
      aiRailMinWidth: 250,
    };
  }

  if (viewportHeight >= 850) {
    return {
      centerRingMin: 80,
      centerTitleFontMin: 24,
      sidePaneMin: 170,
      controlCardMin: 74,
      controlLabelFontMin: 16,
      aiValueFontMin: 14,
      aiRailMinWidth: 230,
    };
  }

  if (viewportHeight >= 760) {
    return {
      centerRingMin: 64,
      centerTitleFontMin: 21,
      sidePaneMin: 130,
      controlCardMin: 66,
      controlLabelFontMin: 14,
      aiValueFontMin: 13,
      aiRailMinWidth: 210,
    };
  }

  return {
    centerRingMin: 56,
    centerTitleFontMin: 19,
    sidePaneMin: 112,
    controlCardMin: 58,
    controlLabelFontMin: 13,
    aiValueFontMin: 12,
    aiRailMinWidth: 190,
  };
}

async function expectLargestSafeFit(page: Page, shellHeader: Locator, workspace: Locator) {
  const headerBox = await shellHeader.boundingBox();
  const workspaceBox = await workspace.boundingBox();

  expect(headerBox, "app shell header should have a measurable bounding box").not.toBeNull();
  expect(workspaceBox, "challenge workspace should have a measurable bounding box").not.toBeNull();
  if (!headerBox || !workspaceBox) return;

  const viewport = page.viewportSize();
  expect(viewport, "viewport should be available").not.toBeNull();
  if (!viewport) return;

  const availableHeight = viewport.height - headerBox.height;
  const unusedVertical = Math.max(0, availableHeight - workspaceBox.height);
  const unusedHorizontal = Math.max(0, viewport.width - workspaceBox.width);

  expect(unusedVertical, "challenge workspace should use nearly all available gameplay height").toBeLessThanOrEqual(
    Math.max(24, availableHeight * 0.04),
  );
  expect(unusedHorizontal, "challenge workspace should use nearly all available gameplay width").toBeLessThanOrEqual(
    Math.max(24, viewport.width * 0.03),
  );
}

async function expectReadableChallengeDensity(page: Page) {
  const viewport = page.viewportSize();
  expect(viewport, "viewport should be available").not.toBeNull();
  if (!viewport) return;

  const thresholds = getReadabilityThresholds(viewport.height);
  const centerRing = page.getByTestId("challenge-arena-center-ring");
  const centerTitle = page.getByTestId("challenge-arena-center-title");
  const leftPane = page.getByTestId("challenge-arena-left-pane");
  const rightPane = page.getByTestId("challenge-arena-right-pane");
  const aiRail = page.getByTestId("challenge-ai-rail");
  const paperButton = page.getByTestId("challenge-controls-option-paper");
  const paperLabel = page.getByTestId("challenge-controls-option-paper-label");
  const intentValue = page.getByTestId("challenge-ai-signal-intent-value");
  const counterValue = page.getByTestId("challenge-ai-signal-counter-value");
  const lastSourceRow = page.getByTestId("challenge-ai-source-row-recency");

  await expectMinHeight(centerRing, "challenge arena center ring", thresholds.centerRingMin);
  await expectMinFontSize(centerTitle, "challenge arena center title", thresholds.centerTitleFontMin);
  await expectMinHeight(leftPane, "challenge player pane", thresholds.sidePaneMin);
  await expectMinHeight(rightPane, "challenge AI pane", thresholds.sidePaneMin);
  await expectMinWidth(aiRail, "challenge AI rail", thresholds.aiRailMinWidth);
  await expectMinHeight(paperButton, "challenge move control card", thresholds.controlCardMin);
  await expectMinFontSize(paperLabel, "challenge move control label", thresholds.controlLabelFontMin);
  await expectMinFontSize(intentValue, "challenge AI intent value", thresholds.aiValueFontMin);
  await expectMinFontSize(counterValue, "challenge AI counter value", thresholds.aiValueFontMin);
  await expectRectInsideRegion(aiRail, lastSourceRow, "challenge AI last source row");
}

async function saveLayoutScreenshot(page: Page, testInfo: TestInfo) {
  const runFolder =
    typeof testInfo.config.metadata.layoutScreenshotRunFolder === "string"
      ? testInfo.config.metadata.layoutScreenshotRunFolder
      : "challenge-post-move-browser_latest";
  const screenshotDir = path.join(process.cwd(), "test-results", "layout", "screenshots", runFolder);
  await mkdir(screenshotDir, { recursive: true });
  const filename = `challenge-post-move-${sanitizeFileSegment(testInfo.project.name)}.png`;
  await page.screenshot({
    path: path.join(screenshotDir, filename),
    fullPage: false,
  });
}

async function driveChallengeIntoExpandedState(page: Page) {
  await page.goto(challengePath);
  await page.waitForLoadState("networkidle");

  const moveButton = page.getByRole("button", { name: /paper/i }).first();
  await expect(moveButton).toBeVisible();
  await moveButton.click();

  const expandedMarker = page.getByTestId("challenge-ai-expanded-marker");
  await expect(expandedMarker).toBeVisible({ timeout: 4_000 });
  await expect(page.getByTestId("challenge-ai-state")).toHaveAttribute("data-live-state", "expanded");
  await page.waitForTimeout(120);
}

test.describe.configure({ mode: "parallel" });

test("challenge gameplay layout fits the viewport in post-move stress state", async ({ page }, testInfo) => {
  await seedChallengeState(page);
  await driveChallengeIntoExpandedState(page);

  const shellHeader = page.getByTestId("play-shell-header");
  const workspace = page.getByTestId("challenge-workspace");
  const header = page.getByTestId("challenge-header");
  const arena = page.getByTestId("challenge-arena");
  const aiRail = page.getByTestId("challenge-ai-rail");
  const controls = page.getByTestId("challenge-move-controls");
  const recent = page.getByTestId("challenge-recent-strip");

  await expect(shellHeader).toBeVisible();
  await expect(workspace).toBeVisible();
  await expect(header).toBeVisible();
  await expect(arena).toBeVisible();
  await expect(aiRail).toBeVisible();
  await expect(controls).toBeVisible();
  await expect(recent).toBeVisible();

  await saveLayoutScreenshot(page, testInfo);

  await expectRectInsideViewport(page, workspace, "challenge workspace");
  await expectRectInsideViewport(page, header, "challenge header");
  await expectRectInsideViewport(page, arena, "challenge arena");
  await expectRectInsideViewport(page, aiRail, "challenge AI rail");
  await expectRectInsideViewport(page, controls, "challenge move controls");
  await expectRectInsideViewport(page, recent, "challenge recent strip");

  await expectNoVerticalOverflow(workspace, "challenge workspace");
  await expectNoVerticalOverflow(aiRail, "challenge AI rail");
  await expectNoVerticalOverflow(controls, "challenge move controls");
  await expectNoHorizontalOverflow(aiRail, "challenge AI rail");
  await expectPageFitsViewport(page);
  await expectLargestSafeFit(page, shellHeader, workspace);
  await expectReadableChallengeDensity(page);

  for (const moveLabel of gameplayMoves) {
    const button = page.getByRole("button", { name: new RegExp(moveLabel, "i") }).first();
    await expect(button).toBeVisible();
    await expectRectInsideViewport(page, button, `challenge ${moveLabel} button`);
  }
});
