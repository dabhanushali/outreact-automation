import playwright from "playwright";

/**
 * Site Verification Service
 * Verifies if a website is a relevant software development agency
 */
export class SiteVerificationService {
  static browser = null;
  static context = null;

  /**
   * Initialize browser
   */
  static async init() {
    if (this.browser) return this.browser;

    this.browser = await playwright.chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });

    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
    });

    return this.browser;
  }

  /**
   * Verify if a website is a software development agency using keywords
   * @param {string} url - The website URL to verify
   * @returns {Object} - {isVerified: boolean, score: number, reasoning: string}
   */
  static async verifyByKeywords(url) {
    await this.init();

    const page = await this.context.newPage();

    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      // Get page text content
      const pageText = await page.evaluate(() => {
        return document.body.innerText.toLowerCase();
      });

      // Define verification keywords
      const positiveKeywords = [
        "software development",
        "web development",
        "app development",
        "mobile app",
        "custom software",
        "it services",
        "development company",
        "software company",
        "tech company",
        "digital agency",
        "web design",
        "application development",
        "enterprise software",
        "software solutions",
        "it consulting",
        "development services",
        "software engineering",
      ];

      // First, check URL and title for directory/listing patterns
      const urlCheck = url.toLowerCase();
      const pageTitle = await page.evaluate(
        () => document.title?.toLowerCase() || ""
      );

      // Directory/listing/blog patterns to skip
      const directoryPatterns = [
        "companies in",
        "software development companies",
        "it companies",
        "tech companies",
        "/blog/",
        "/blog",
        "news",
        "directory",
        "company listing",
        "business listing",
        "/listing",
        "marketplace",
        " reviews",
        "comparison",
        " vs ",
        "pricing",
        "alternatives",
        "clutch.co",
        "goodfirms.co",
        "utm_campaign=directory",
        "utm_source=clutch",
        "utm_source=goodfirms",
      ];

      // Check if URL or title contains directory patterns
      for (const pattern of directoryPatterns) {
        if (urlCheck.includes(pattern) || pageTitle.includes(pattern)) {
          // Exception: allow if patterns are only in UTM but we want to be strict for now
          // If we resolved the URL properly in the scraper, these should be mostly gone
          await page.close();
          return {
            isVerified: false,
            score: -999,
            reasoning: `Directory/Listing page detected (contains "${pattern}")`,
            method: "keyword",
          };
        }
      }

      const negativeKeywords = [
        "blog",
        "news site",
        "e-commerce store",
        "shopping cart",
        "product catalog",
        "real estate",
        "restaurant",
        "hotel booking",
        "travel booking",
      ];

      // Count keyword matches
      let positiveScore = 0;
      let negativeScore = 0;

      for (const keyword of positiveKeywords) {
        if (pageText.includes(keyword)) {
          positiveScore++;
        }
      }

      for (const keyword of negativeKeywords) {
        if (pageText.includes(keyword)) {
          negativeScore++;
        }
      }

      // Calculate final score
      const finalScore = positiveScore - negativeScore * 2;

      // Make decision
      const isVerified = finalScore >= 2;

      // Generate reasoning
      let reasoning = `Score: ${finalScore}. `;
      if (positiveScore > 0) {
        reasoning += `Found ${positiveScore} positive keywords. `;
      }
      if (negativeScore > 0) {
        reasoning += `Found ${negativeScore} negative keywords. `;
      }

      return {
        isVerified,
        score: finalScore,
        reasoning: reasoning.trim(),
        method: "keyword",
      };
    } catch (error) {
      return {
        isVerified: false,
        score: -999,
        reasoning: `Error loading page: ${error.message}`,
        method: "keyword",
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Verify by AI (placeholder for future AI integration)
   * @param {string} url - The website URL to verify
   * @param {string} pageText - The page text content
   * @returns {Object} - {isVerified: boolean, score: number, reasoning: string}
   */
  static async verifyByAI(url, pageText) {
    // TODO: Integrate with AI API (OpenAI, Claude, etc.)
    // For now, return a placeholder response
    return {
      isVerified: false,
      score: 0,
      reasoning: "AI verification not yet implemented",
      method: "ai",
    };
  }

  /**
   * Main verification method - tries keyword check first
   * @param {string} url - The website URL to verify
   * @param {number} prospectId - The prospect ID for storing verification
   * @returns {Object} - Verification result
   */
  static async verify(url, prospectId, method = "keyword") {
    let result;

    if (method === "ai") {
      // For AI, we'd need to fetch page text first
      await this.init();
      const page = await this.context.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        const pageText = await page.evaluate(() => document.body.innerText);
        result = await this.verifyByAI(url, pageText);
      } finally {
        await page.close();
      }
    } else {
      result = await this.verifyByKeywords(url);
    }

    return result;
  }

  /**
   * Close browser
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
