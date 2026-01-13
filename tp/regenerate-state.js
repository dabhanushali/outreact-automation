/**
 * regenerate-state.js
 * Opens a headed browser to manually solve CAPTCHA and save fresh cookies
 *
 * IMPORTANT:
 * 1. When browser opens, do a Google search
 * 2. Click on a few results
 * 3. Go back and do another search
 * 4. This builds up legitimate cookies
 * 5. Press Ctrl+C in terminal when done (cookies auto-save every 5 seconds)
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_FILE = path.join(__dirname, "browser-state.json");

async function regenerateBrowserState() {
  console.log("\n🔐 Browser State Regenerator");
  console.log("━".repeat(50));
  console.log("A browser window will open.");
  console.log("\nINSTRUCTIONS:");
  console.log("  1. Solve any CAPTCHA if prompted");
  console.log("  2. Do several Google searches");
  console.log("  3. Click on search results, browse around");
  console.log("  4. This builds up legitimate cookies");
  console.log("  5. Cookies are saved every 5 seconds");
  console.log("  6. Press Ctrl+C here when done");
  console.log("━".repeat(50) + "\n");

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "en-US",
    timezoneId: "Asia/Kolkata",
  });

  // Add stealth scripts
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });
  });

  const page = await context.newPage();

  // Auto-save cookies every 5 seconds
  let lastSaveTime = Date.now();
  const saveInterval = setInterval(async () => {
    try {
      const cookies = await context.cookies();
      // Filter for Google cookies WITHOUT partitionKey (Playwright doesn't support partitioned cookies)
      const validCookies = cookies
        .filter(
          (c) =>
            (c.domain.includes("google.com") ||
              c.domain.includes("youtube.com")) &&
            !c.partitionKey // Skip partitioned cookies
        )
        .map((c) => {
          // Remove unsupported properties
          const { partitionKey, _crHasCrossSiteAncestor, ...cleanCookie } = c;
          return cleanCookie;
        });
      if (validCookies.length > 0) {
        fs.writeFileSync(STATE_FILE, JSON.stringify(validCookies, null, 2));
        const now = Date.now();
        if (now - lastSaveTime >= 10000) {
          // Log every 10 seconds
          console.log(`💾 Auto-saved ${validCookies.length} valid cookies`);
          lastSaveTime = now;
        }
      }
    } catch (e) {
      // Context closed
    }
  }, 5000);

  // Handle Ctrl+C gracefully
  process.on("SIGINT", async () => {
    console.log("\n\n📥 Saving final cookies...");
    clearInterval(saveInterval);
    try {
      const cookies = await context.cookies();
      const validCookies = cookies
        .filter(
          (c) =>
            (c.domain.includes("google.com") ||
              c.domain.includes("youtube.com")) &&
            !c.partitionKey
        )
        .map((c) => {
          const { partitionKey, _crHasCrossSiteAncestor, ...cleanCookie } = c;
          return cleanCookie;
        });
      fs.writeFileSync(STATE_FILE, JSON.stringify(validCookies, null, 2));
      console.log(
        `✅ Saved ${validCookies.length} valid cookies to browser-state.json`
      );
    } catch (e) {
      console.log("⚠️ Could not save final cookies");
    }
    await browser.close();
    console.log("🏁 Done!\n");
    process.exit(0);
  });

  try {
    console.log("📍 Opening Google...\n");
    await page.goto("https://www.google.com", { waitUntil: "networkidle" });

    console.log("👉 Browse around, do some searches, click results.");
    console.log("👉 Press Ctrl+C in this terminal when done.\n");

    // Keep running until Ctrl+C
    await new Promise(() => {});
  } catch (error) {
    console.error("Error:", error.message);
    clearInterval(saveInterval);
    await browser.close();
  }
}

regenerateBrowserState().catch(console.error);
