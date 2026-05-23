// Record the in-browser ad as a WebM video file using Playwright.
//
// Usage:
//   PW_BROWSERS_PATH=/opt/pw-browsers node scripts/record-ad.js [url] [outDir]
//
// Defaults: records the Vercel preview at 1080x1920 (vertical, social-media
// ratio) for 64 seconds (60s ad + 4s buffer for the end card and replay flash).

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

(async () => {
  const url =
    process.argv[2] ||
    "https://catalogstore-git-claude-in-browser-ad-4regns-projects.vercel.app/ad";
  const outDir = path.resolve(process.argv[3] || "/tmp/ad-recordings");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("→ Launching chromium...");
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--autoplay-policy=no-user-gesture-required"],
  });

  // 1080x1920 = 9:16 vertical, the standard format for Instagram Reels,
  // TikTok, and YouTube Shorts. Convert to landscape later if needed.
  const VIEWPORT = { width: 1080, height: 1920 };
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: outDir, size: VIEWPORT },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  console.log(`→ Navigating to ${url}`);
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });

  // Wait a beat so the page is fully painted before we start counting
  await page.waitForTimeout(500);

  // Restart the ad so it starts from scene 1 (in case page-mount jitter ate
  // any of the early frames). The component starts auto-playing so this is
  // belt + braces -- we'll re-trigger to be safe.
  console.log("→ Recording 64 seconds...");
  await page.waitForTimeout(64_000);

  console.log("→ Stopping recording...");
  await page.close();
  await context.close();
  await browser.close();

  // Find the most recent .webm
  const files = fs
    .readdirSync(outDir)
    .filter((f) => f.endsWith(".webm"))
    .map((f) => ({ f, t: fs.statSync(path.join(outDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  if (!files.length) {
    console.error("No .webm produced");
    process.exit(1);
  }

  const src = path.join(outDir, files[0].f);
  const finalPath = path.join(outDir, "catalogstore-ad.webm");
  fs.renameSync(src, finalPath);
  const stats = fs.statSync(finalPath);
  console.log(`✓ Saved: ${finalPath}  (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
})();
