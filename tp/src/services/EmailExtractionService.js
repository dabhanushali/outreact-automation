import { GoogleSearch } from "./GoogleSearch.js";

/**
 * Email Extraction Service
 * Finds contact pages and extracts email addresses
 * Reuses the same browser context as GoogleSearch to avoid conflicts
 */
export class EmailExtractionService {
  /**
   * Initialize browser - reuse GoogleSearch's context
   */
  static async init() {
    // Reuse the same context as GoogleSearch
    await GoogleSearch.init();
    this.context = GoogleSearch.context;
    return this.context;
  }

  /**
   * Find contact page link
   * @param {string} baseUrl - The website URL
   * @returns {string|null} - Contact page URL or null
   */
  static async findContactPage(baseUrl) {
    await this.init();

    // Reuse existing page or create a new one
    let page = this.context.pages().find((p) => !p.isClosed());
    if (!page) {
      page = await this.context.newPage();
    }

    try {
      await page.goto(baseUrl, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      // Look for contact page links
      const contactLink = await page.evaluate(() => {
        const contactSelectors = [
          'a[href*="contact"]',
          'a[href*="contact-us"]',
          'a[href*="contactus"]',
          'a[href*="get-in-touch"]',
          'a[href*="about"]',
          'a[href*="team"]',
        ];

        const links = Array.from(document.querySelectorAll("a"));

        // Priority: exact "contact" matches first
        for (const selector of contactSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = el.textContent.toLowerCase().trim();
            const href = el.href;
            if (
              href &&
              (text.includes("contact") || text.includes("get in touch"))
            ) {
              return href;
            }
          }
        }

        // Fallback: any link containing "contact"
        for (const link of links) {
          const href = link.href?.toLowerCase();
          if (href && href.includes("contact")) {
            return link.href;
          }
        }

        return null;
      });

      return contactLink;
    } catch (error) {
      console.error(`Error finding contact page: ${error.message}`);
      return null;
    }
    // Don't close page - reuse it
  }

  /**
   * Extract emails from a page
   * @param {string} url - The page URL
   * @returns {Array} - Array of email objects {email, sourcePage}
   */
  static async extractEmails(url) {
    await this.init();

    // Reuse existing page or create a new one
    let page = this.context.pages().find((p) => !p.isClosed());
    if (!page) {
      page = await this.context.newPage();
    }

    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      // Get page text and HTML
      const { pageText, pageHtml } = await page.evaluate(() => {
        return {
          pageText: document.body.innerText,
          pageHtml: document.body.innerHTML,
        };
      });

      // Email regex pattern
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

      // Extract emails from text
      const emails = new Set();
      let match;

      while ((match = emailRegex.exec(pageText)) !== null) {
        emails.add(match[0].toLowerCase());
      }

      // Also check HTML for mailto links
      const mailtoRegex =
        /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
      while ((match = mailtoRegex.exec(pageHtml)) !== null) {
        emails.add(match[1].toLowerCase());
      }

      // Convert to array and filter
      const results = Array.from(emails)
        .filter((email) => {
          // Filter out common false positives
          const [localPart, domain] = email.split("@");

          // Exclude common example/trap emails
          const excludePatterns = [
            "example",
            "test",
            "sample",
            "your-email",
            "email@address",
            "noreply",
            "no-reply",
            "donotreply",
            "do-not-reply",
            "privacy",
            "terms",
            "legal",
            "abuse",
            "postmaster",
            "webmaster",
            "localhost",
            "example.com",
            "test.com",
            ".png",
            ".jpg",
            ".jpeg",
            ".gif",
            ".svg",
            ".css",
            ".js",
          ];

          for (const pattern of excludePatterns) {
            if (email.includes(pattern)) {
              return false;
            }
          }

          // Must have valid domain
          if (!domain || domain.includes(".") === false) {
            return false;
          }

          return true;
        })
        .map((email) => ({
          email,
          sourcePage: url,
        }));

      return results;
    } catch (error) {
      console.error(`Error extracting emails from ${url}: ${error.message}`);
      return [];
    }
    // Don't close page - reuse it
  }

  /**
   * Extract emails from a website (homepage + contact page)
   * @param {string} websiteUrl - The website URL
   * @returns {Array} - Array of unique email objects
   */
  static async extractFromWebsite(websiteUrl) {
    const allEmails = new Map(); // Use Map to deduplicate while keeping best source

    // First, try homepage
    console.log(`    Scanning homepage for emails...`);
    let homepageEmails = await this.extractEmails(websiteUrl);
    for (const email of homepageEmails) {
      allEmails.set(email.email, email);
    }

    // Then, try contact page
    const contactUrl = await this.findContactPage(websiteUrl);
    if (contactUrl && contactUrl !== websiteUrl) {
      console.log(`    Scanning contact page: ${contactUrl}`);
      let contactEmails = await this.extractEmails(contactUrl);
      for (const email of contactEmails) {
        // If email already found, update source to contact page (better source)
        allEmails.set(email.email, email);
      }
    }

    return Array.from(allEmails.values());
  }

  /**
   * Check if email domain matches website domain
   * @param {string} email - The email address
   * @param {string} websiteUrl - The website URL
   * @returns {boolean} - True if domains match
   */
  static isDomainMatch(email, websiteUrl) {
    try {
      const emailDomain = email.split("@")[1].toLowerCase();
      const urlDomain = new URL(websiteUrl).hostname.toLowerCase();

      // Remove www. prefix for comparison
      const cleanEmailDomain = emailDomain.replace(/^www\./, "");
      const cleanUrlDomain = urlDomain.replace(/^www\./, "");

      return cleanEmailDomain === cleanUrlDomain;
    } catch {
      return false;
    }
  }

  /**
   * Check if email is generic (info@, contact@, etc.)
   * @param {string} email - The email address
   * @returns {boolean} - True if generic
   */
  static isGeneric(email) {
    const genericPrefixes = [
      "info",
      "contact",
      "hello",
      "mail",
      "admin",
      "support",
      "sales",
      "enquiry",
      "inquiry",
      "office",
      "team",
      "general",
      "info@",
      "contact@",
    ];

    const localPart = email.split("@")[0].toLowerCase();

    return genericPrefixes.includes(localPart);
  }

  /**
   * Close browser - delegated to GoogleSearch since we share the context
   */
  static async close() {
    // Don't close here - let GoogleSearch handle cleanup
    // We share the same browser context
    await GoogleSearch.close();
  }
}
