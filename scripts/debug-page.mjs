import { chromium } from "@playwright/test";

const url = process.env.DEBUG_URL ?? "http://host.docker.internal:4174/play/profile/create";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1264, height: 578 } });

page.on("console", message => {
  console.log(`[console:${message.type()}] ${message.text()}`);
});

page.on("pageerror", error => {
  console.log(`[pageerror] ${error.stack || error.message}`);
});

await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
console.log(`[url] ${page.url()}`);
console.log("[body]");
console.log(await page.locator("body").innerText());

await browser.close();
