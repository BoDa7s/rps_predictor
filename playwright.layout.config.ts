import { defineConfig } from "@playwright/test";

const host = "127.0.0.1";
const port = 4174;
const baseURL = `http://${host}:${port}`;

function buildLayoutScreenshotRunFolderName() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Chicago",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map(part => [part.type, part.value]),
  ) as Record<string, string>;

  const date = `${parts.month}-${parts.day}-${parts.year}`;
  const time = `${parts.hour}-${parts.minute}-${parts.dayPeriod?.toUpperCase() ?? "PM"}`;
  return `challenge-post-move-browser_${date}_${time}`;
}

const viewportProjects = [
  { name: "browser-1920x1080", viewport: { width: 1904, height: 938 } },
  { name: "browser-1600x900", viewport: { width: 1584, height: 758 } },
  { name: "browser-1536x864", viewport: { width: 1520, height: 722 } },
  { name: "browser-1440x900", viewport: { width: 1424, height: 758 } },
  { name: "browser-1440x810", viewport: { width: 1424, height: 668 } },
  { name: "browser-1366x768", viewport: { width: 1350, height: 626 } },
  { name: "browser-1280x720", viewport: { width: 1264, height: 578 } },
  { name: "browser-1200x560", viewport: { width: 1200, height: 560 } },
  { name: "browser-1160x540", viewport: { width: 1160, height: 540 } },
  { name: "browser-1120x520", viewport: { width: 1120, height: 520 } },
  { name: "browser-1080x500", viewport: { width: 1080, height: 500 } },
  { name: "browser-1040x480", viewport: { width: 1040, height: 480 } },
  { name: "browser-1000x460", viewport: { width: 1000, height: 460 } },
];

export default defineConfig({
  testDir: "./tests/layout",
  timeout: 30_000,
  metadata: {
    layoutScreenshotRunFolder: buildLayoutScreenshotRunFolderName(),
  },
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  outputDir: "test-results/layout/artifacts",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "test-results/layout/report" }],
  ],
  use: {
    baseURL,
    browserName: "chromium",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: viewportProjects.map(project => ({
    name: project.name,
    use: {
      viewport: project.viewport,
    },
  })),
  webServer: {
    command: `npm run dev -- --host ${host} --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
