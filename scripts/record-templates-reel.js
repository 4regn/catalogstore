const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

(async () => {
  const url = "http://localhost:3000/ad/templates";
  const outDir = "/tmp/ad-recordings";
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });

  const VIEWPORT = { width: 1080, height: 1920 };
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: outDir, size: VIEWPORT },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  console.log(`→ ${url}`);
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(500);

  // 4 templates × 7.5s = 30s, +1s lead-in buffer
  console.log("→ Recording 31s...");
  await page.waitForTimeout(31_000);

  await page.close();
  await context.close();
  await browser.close();

  const files = fs
    .readdirSync(outDir)
    .filter((f) => f.endsWith(".webm"))
    .map((f) => ({ f, t: fs.statSync(path.join(outDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  const src = path.join(outDir, files[0].f);
  const finalPath = path.join(outDir, "catalogstore-templates-reel.webm");
  fs.renameSync(src, finalPath);
  console.log(`✓ ${finalPath}  ${(fs.statSync(finalPath).size / 1024 / 1024).toFixed(1)} MB`);
})();
