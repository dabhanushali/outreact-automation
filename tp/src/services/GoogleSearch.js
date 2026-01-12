import playwright from "playwright";

/**
 * Custom Google Search using Playwright
 * Bypasses anti-bot detection with realistic browser behavior
 */
export class GoogleSearch {
  static browser = null;
  static context = null;
  static stateFile = "./browser-state.json";

  /**
   * Initialize browser with state persistence
   */
  static async init() {
    if (this.browser) return this.browser;

    this.browser = await playwright.chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
      ],
    });

    // Create context with realistic user agent
    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
    });

    // Load state if exists (cookies, storage)
    try {
      const fs = await import("fs");
      if (fs.existsSync(this.stateFile)) {
        await this.context.addCookies(
          JSON.parse(fs.readFileSync(this.stateFile, "utf8"))
        );
      }
    } catch (e) {
      // State file doesn't exist yet
    }

    return this.browser;
  }

  /**
   * Save browser state for future sessions
   */
  static async saveState() {
    try {
      const fs = await import("fs");
      const cookies = await this.context.cookies();
      fs.writeFileSync(this.stateFile, JSON.stringify(cookies, null, 2));
    } catch (e) {
      console.error("Failed to save browser state:", e.message);
    }
  }

  /**
   * Search Google and return organic results
   * @param {string} query - Search query
   * @param {number} limit - Number of results (default: 10)
   * @returns {Promise<Array>} - Array of {title, link, snippet}
   */
  static async search(query, limit = 10) {
    await this.init();

    const page = await this.context.newPage();

    try {
      // Add random delay to mimic human behavior
      await page.waitForTimeout(Math.random() * 1000 + 500);

      // Navigate to Google
      await page.goto("https://www.google.com/search?q=" + encodeURIComponent(query), {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      // Wait for results to load
      await page.waitForSelector('div[data-hveid]', { timeout: 10000 });

      // Extract organic results
      const results = await page.evaluate((maxResults) => {
        const organicResults = [];

        // Find all search result containers
        const resultContainers = document.querySelectorAll('div[data-hveid]');

        for (const container of resultContainers) {
          if (organicResults.length >= maxResults) break;

          // Skip non-organic results (ads, featured snippets, etc.)
          if (container.querySelector('span[role="text"]')?.textContent?.includes("Ad")) {
            continue;
          }

          // Get the title and link
          const titleElement = container.querySelector("h3");
          const linkElement = container.querySelector("a");

          if (!titleElement || !linkElement) continue;

          // Get the title
          const title = titleElement.textContent?.trim();

          // Get the actual URL (not the google redirect)
          let link = linkElement.href;
          // Handle Google redirect URLs
          if (link.includes("/url?")) {
            const urlMatch = link.match(/[?&]url=([^&]+)/);
            if (urlMatch) {
              try {
                link = decodeURIComponent(urlMatch[1]);
              } catch (e) {
                // If decode fails, use original link
              }
            }
          }

          // Get snippet/description
          const snippetElement = container.querySelector(
            'div[data-hveid] span[role="text"]'
          );
          const snippet = snippetElement?.textContent?.trim() || "";

          if (title && link) {
            organicResults.push({ title, link, snippet });
          }
        }

        return organicResults;
      }, limit);

      return results;
    } catch (error) {
      console.error(`Search failed for query "${query}":`, error.message);
      return [];
    } finally {
      await page.close();
      // Save state after successful search
      if (Math.random() > 0.5) {
        await this.saveState();
      }
    }
  }

  /**
   * Close browser and save state
   */
  static async close() {
    if (this.context) {
      await this.saveState();
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
    }
  }
}
