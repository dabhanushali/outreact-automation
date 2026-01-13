import playwright from "playwright";
import path from "path";

/**
 * Custom Google Search using Playwright
 * Uses persistent Chrome profile to avoid CAPTCHAs
 */
export class GoogleSearch {
  static browser = null;
  static context = null;
  static userDataDir = "C:\\automation_chrome";

  /**
   * Initialize browser with persistent Chrome profile
   */
  static async init() {
    if (this.context) return this.context;

    try {
      console.log(`🔐 Using persistent Chrome profile: ${this.userDataDir}`);

      // Create persistent context with real Chrome user data directory
      this.context = await playwright.chromium.launchPersistentContext(
        this.userDataDir,
        {
          executablePath:
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          headless: false, // Must be false for persistent context
          channel: "chrome", // Use actual Chrome browser instead of Chromium
          args: [
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-infobars",
            "--profile-directory=Default",
          ],
          ignoreDefaultArgs: ["--disable-extensions"],
          viewport: { width: 1920, height: 1080 },
          locale: "en-US",
          timezoneId: "America/New_York",
          permissions: ["geolocation"],
        }
      );

      // Enhanced stealth scripts for persistent context
      await this.context.addInitScript(() => {
        // Remove webdriver property
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined,
        });

        // Mock plugins
        Object.defineProperty(navigator, "plugins", {
          get: () => [
            {
              0: {
                type: "application/x-google-chrome-pdf",
                suffixes: "pdf",
                description: "Portable Document Format",
                __pluginName: "Chrome PDF Plugin",
              },
              description: "Portable Document Format",
              filename: "internal-pdf-viewer",
              length: 1,
              name: "Chrome PDF Plugin",
            },
          ],
        });

        // Mock languages
        Object.defineProperty(navigator, "languages", {
          get: () => ["en-US", "en"],
        });

        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => {
          return parameters.name === "notifications"
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters);
        };
      });

      // Keep reference to browser for cleanup
      this.browser = this.context._browser;

      console.log(`✅ Persistent Chrome profile initialized`);
      return this.browser;
    } catch (error) {
      console.error("Failed to initialize persistent browser:", error.message);
      throw error;
    }
  }

  // Note: No saveState() needed - persistent context saves everything automatically

  /**
   * Search Google and return organic results with retry logic
   * @param {string} query - Search query
   * @param {number} limit - Number of results (default: 10)
   * @param {number} maxRetries - Maximum retry attempts (default: 3)
   * @returns {Promise<Array>} - Array of {title, link, snippet}
   */
  static async search(query, limit = 10, maxRetries = 3) {
    await this.init();

    // Reuse existing page or create a new one
    let page = this.context.pages().find((p) => !p.isClosed());
    if (!page) {
      page = await this.context.newPage();
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Add random delay to mimic human behavior (longer on retries)
        const baseDelay = attempt === 1 ? 3000 : 8000 * attempt;
        await page.waitForTimeout(Math.random() * 3000 + baseDelay);

        // Navigate to Google with longer timeout on retries
        const timeout = attempt === 1 ? 30000 : 60000;
        await page.goto(
          "https://www.google.com/search?q=" + encodeURIComponent(query),
          {
            waitUntil: "domcontentloaded",
            timeout: timeout,
          }
        );

        // Check for CAPTCHA (more specific to avoid false positives)
        // const captchaDetected = await page.evaluate(() => {
        //   // Look for actual CAPTCHA elements (not just text content)
        //   const captchaIframe = document.querySelector('iframe[src*="captcha"]');
        //   const recaptchaElement = document.querySelector('.g-recaptcha') ||
        //                           document.querySelector('#recaptcha') ||
        //                           document.querySelector('[data-sitekey]');
        //   const hcaptchaElement = document.querySelector('.h-captcha');
        //   const captchaForm = document.querySelector('form[action*="captcha"]');
        //   const captchaInput = document.querySelector('input[name="captcha"]');

        //   // Cloudflare challenge detection
        //   const bodyText = document.body?.textContent || "";
        //   const cloudflareChallenge = bodyText.includes('Just a moment') ||
        //                              bodyText.includes('Checking your browser') ||
        //                              bodyText.includes('Challenge required') ||
        //                              document.querySelector('div[class*="cf-"]') !== null;

        //   // Google-specific CAPTCHA detection
        //   const googleCaptcha = document.querySelector('#captcha') ||
        //                        document.querySelector('[role="presentation"]');

        //   return !!(captchaIframe || recaptchaElement || hcaptchaElement ||
        //            captchaForm || captchaInput || cloudflareChallenge || googleCaptcha);
        // });
        const captchaDetected = false;

        if (captchaDetected) {
          console.warn(
            `⚠️ CAPTCHA detected on attempt ${attempt} for query: "${query}"`
          );
          if (attempt < maxRetries) {
            console.log(`   ⏳ Waiting for you to solve CAPTCHA manually...`);
            console.log(`   Retrying in ${15 * attempt} seconds...`);
            // Wait longer to let user solve CAPTCHA manually
            await new Promise((resolve) =>
              setTimeout(resolve, 15000 * attempt)
            );
            continue;
          } else {
            console.error(`   All retry attempts failed due to CAPTCHA`);
            console.error(
              `   Please solve the CAPTCHA in the Chrome window and try again.`
            );
            return [];
          }
        }

        // Wait for results to load (longer on retries)
        const loadWait = attempt === 1 ? 2000 : 4000;
        await page.waitForTimeout(loadWait);

        // Extract organic results
        const results = await page.evaluate((maxResults) => {
          const organicResults = [];

          // Find all search result containers
          const resultContainers = document.querySelectorAll(
            "div[data-hveid], div.g, div[data-ved]"
          );

          for (const container of resultContainers) {
            if (organicResults.length >= maxResults) break;

            // Skip non-organic results (ads, featured snippets, etc.)
            const adLabel = container.querySelector('span[role="text"]');
            if (adLabel && adLabel.textContent?.includes("Ad")) {
              continue;
            }

            // Skip "People also ask" and other non-organic elements
            if (
              container.closest("[data-abe]") ||
              container.querySelector("[data-md]") ||
              container.textContent?.includes("People also ask")
            ) {
              continue;
            }

            // Get the title and link
            const titleElement = container.querySelector("h3");
            const linkElement = container.querySelector("a[href]");

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
              'div[style*="-webkit-line-clamp"], span[role="text"], div[data-ved] span'
            );
            const snippet = snippetElement?.textContent?.trim() || "";

            if (
              title &&
              link &&
              !link.includes("google.com") &&
              link.startsWith("http")
            ) {
              organicResults.push({ title, link, snippet });
            }
          }

          return organicResults;
        }, limit);

        // Success - return results (persistent context auto-saves)
        // Don't close the page - reuse it for next searches
        return results;
      } catch (error) {
        console.error(
          `Search attempt ${attempt}/${maxRetries} failed for query "${query}":`,
          error.message
        );

        if (attempt < maxRetries) {
          // Exponential backoff
          const waitTime = Math.min(10000 * Math.pow(2, attempt - 1), 60000);
          console.log(`   Retrying in ${waitTime / 1000} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        } else {
          console.error(`   All ${maxRetries} attempts failed`);
          return [];
        }
      }
    }
  }

  /**
   * Close browser (persistent context auto-saves)
   */
  static async close() {
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
    }
  }
}
