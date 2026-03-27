import { defineConfig } from "@playwright/test";

const host = "127.0.0.1";
const port = 4174;
const baseURL = `http://${host}:${port}`;

const viewportProjects = [
  { name: "desktop-1920x1080", viewport: { width: 1920, height: 1080 } },
  { name: "desktop-1600x900", viewport: { width: 1600, height: 900 } },
  { name: "desktop-1536x864", viewport: { width: 1536, height: 864 } },
  { name: "desktop-1440x900", viewport: { width: 1440, height: 900 } },
  { name: "desktop-1440x810", viewport: { width: 1440, height: 810 } },
  { name: "desktop-1366x768", viewport: { width: 1366, height: 768 } },
  { name: "desktop-1280x720", viewport: { width: 1280, height: 720 } },
];

export default defineConfig({
  testDir: "./tests/layout",
  timeout: 30_000,
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
