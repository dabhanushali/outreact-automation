import { chromium } from "playwright";
import Logger from "./logger.js";
import { config } from "./config.js";

const logger = new Logger("browser-core");

class BrowserService {
  constructor() {
    this.browser = null;
    this.context = null;
  }

  async init() {
    if (this.browser) return;

    logger.info("Launching browser...");
    try {
      this.browser = await chromium.launch({
        headless: config.HEADLESS,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-blink-features=AutomationControlled", // basic stealth
        ],
      });

      this.context = await this.browser.newContext({
        userAgent: config.USER_AGENT,
        viewport: { width: 1280, height: 800 },
        locale: "en-US",
        timezoneId: "America/New_York",
      });

      // Add simple stealth scripts
      await this.context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined,
        });
      });

      logger.info("Browser launched successfully.");
    } catch (error) {
      logger.error("Failed to launch browser", error);
      throw error;
    }
  }

  async newPage() {
    if (!this.context) await this.init();
    return await this.context.newPage();
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      logger.info("Browser closed.");
    }
  }
}

// Singleton instance
const browserService = new BrowserService();
export default browserService;
