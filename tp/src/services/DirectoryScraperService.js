import playwright from "playwright";

/**
 * Directory Scraper Service
 * Scrapes company listings from Clutch.co and GoodFirms.co
 */
export class DirectoryScraperService {
  static browser = null;
  static context = null;

  /**
   * Initialize browser with anti-detection settings
   */
  static async init() {
    if (this.browser) return this.browser;

    this.browser = await playwright.chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
    });

    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
      timezoneId: "America/New_York",
      permissions: ["geolocation"],
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    // Inject stealth scripts to hide playwright traces
    await this.context.addInitScript(() => {
      // Hide webdriver property
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });

      // Mock plugins
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });

      // Mock languages
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
    });

    return this.browser;
  }

  /**
   * Scrape Clutch.co directory page
   * @param {string} url - Clutch directory URL (e.g., https://clutch.co/in/developers/ahmedabad)
   * @returns {Array} - Array of {companyName, websiteUrl, profileUrl}
   */
  static async scrapeClutch(url) {
    await this.init();

    const page = await this.context.newPage();

    try {
      console.log(`  > Scraping Clutch: ${url}`);

      // Try with more lenient wait strategy
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });

      // Wait a bit for dynamic content to load
      await page.waitForTimeout(3000);

      // Wait for listings with a longer timeout
      await page
        .waitForSelector(".provider, .list-item, .profile, article", {
          timeout: 15000,
        })
        .catch(() => {
          console.log(
            `    Warning: Listings selector not found, trying anyway...`
          );
        });

      // Extract company listings from the directory page
      const listings = await page.evaluate(() => {
        const results = [];

        // Try multiple selectors for Clutch listings
        const containers = document.querySelectorAll(
          ".provider, .list-item, .profile, article, [data-profile], .card"
        );

        for (const container of containers) {
          try {
            // Company name
            const nameEl =
              container.querySelector("h3 a") ||
              container.querySelector("h2 a") ||
              container.querySelector(".name a") ||
              container.querySelector("a[href*='/profile/']");
            const name = nameEl?.textContent?.trim() || "";

            // Profile URL (always available)
            const profileUrl = nameEl?.href || "";

            // Try to find website URL on listing page
            const websiteEl =
              container.querySelector("a.website-link") ||
              container.querySelector(".website") ||
              container.querySelector("a[rel='nofollow']") ||
              container.querySelector(".icon-globe");

            const websiteUrl = websiteEl?.href || "";

            if (name && profileUrl && profileUrl.includes("clutch.co")) {
              results.push({
                companyName: name,
                profileUrl,
                websiteUrl: websiteUrl || null, // null means we need to visit profile page
              });
            }
          } catch (e) {
            // Skip invalid entries
          }
        }

        return results;
      });

      console.log(`    Found ${listings.length} company listings from Clutch`);

      if (listings.length === 0) {
        return [];
      }

      // For companies without website URLs, visit their profile pages
      const companies = [];
      const profilePage = await this.context.newPage();

      for (const listing of listings) {
        try {
          if (listing.websiteUrl && !listing.websiteUrl.includes("clutch.co")) {
            // Already have website URL and it's not a clutch URL
            companies.push(listing);
          } else if (listing.profileUrl) {
            // Need to visit profile page to get website
            console.log(`    Visiting profile: ${listing.companyName}`);

            await profilePage.goto(listing.profileUrl, {
              waitUntil: "domcontentloaded",
              timeout: 20000,
            });

            // Wait for content to load
            await profilePage.waitForTimeout(2000);

            // Try to find and click the "Visit Website" button using Playwright locators
            let websiteUrl = null;

            // Method 1: Try to find link with "Visit" text followed by company name
            try {
              const visitButton = profilePage.getByRole("link", {
                name: new RegExp(`visit ${listing.companyName}`, "i"),
              });
              if ((await visitButton.count()) > 0) {
                const href = await visitButton.first().getAttribute("href");
                if (
                  href &&
                  !href.includes("clutch.co") &&
                  !href.includes("ppc.clutch.co")
                ) {
                  websiteUrl = href;
                }
              }
            } catch (e) {
              // Continue to next method
            }

            // Method 2: Try to find any link with "Visit Website" text
            if (!websiteUrl) {
              try {
                const visitWebsiteButton = profilePage.getByRole("link", {
                  name: /visit website/i,
                });
                if ((await visitWebsiteButton.count()) > 0) {
                  // Get all matching links
                  const buttons = await visitWebsiteButton.all();
                  for (const button of buttons) {
                    const href = await button.getAttribute("href");
                    // Skip redirect URLs
                    if (
                      href &&
                      !href.includes("clutch.co") &&
                      !href.includes("ppc.clutch.co") &&
                      !href.includes("r.clutch.co") &&
                      !href.includes("g.clutch.co")
                    ) {
                      websiteUrl = href;
                      break;
                    }
                  }
                }
              } catch (e) {
                // Continue to next method
              }
            }

            // Method 3: Try to find button with role="button" containing "Visit"
            if (!websiteUrl) {
              try {
                const visitButtons = await profilePage
                  .getByRole("button", { name: /Visit/i })
                  .all();
                for (const button of visitButtons) {
                  // Check if clicking this button would navigate (has onclick or form parent)
                  const onclick = await button.getAttribute("onclick");
                  if (onclick) {
                    // Try to extract URL from onclick
                    const urlMatch = onclick.match(/https?:\/\/[^"'`]+/);
                    if (urlMatch && !urlMatch[0].includes("clutch.co")) {
                      websiteUrl = urlMatch[0];
                      break;
                    }
                  }
                }
              } catch (e) {
                // Continue
              }
            }

            // Method 4: Try to find by text content "Visit" or "Website" in link role
            if (!websiteUrl) {
              try {
                const links = await profilePage.getByRole("link").all();
                for (const link of links) {
                  const href = await link.getAttribute("href");
                  const text = await link.textContent();

                  // Skip clutch/goodfirms
                  if (
                    !href ||
                    href.includes("clutch.co") ||
                    href.includes("goodfirms")
                  ) {
                    continue;
                  }

                  // Check for redirect URLs
                  if (
                    href.includes("ppc.clutch.co") ||
                    href.includes("r.clutch.co") ||
                    href.includes("g.clutch.co")
                  ) {
                    continue;
                  }

                  // Look for "visit" or "website" in text
                  const lowerText = text?.toLowerCase() || "";
                  if (
                    lowerText.includes("visit") ||
                    lowerText.includes("website")
                  ) {
                    websiteUrl = href;
                    break;
                  }
                }
              } catch (e) {
                // Continue
              }
            }

            // Method 5: Try getByText for "Visit" or "Website"
            if (!websiteUrl) {
              try {
                const visitText = profilePage.getByText(/visit\s+website/i);
                if ((await visitText.count()) > 0) {
                  // Find the closest anchor element
                  const element = await visitText.first();
                  const href = await element.evaluate((el) => {
                    const closest = el.closest("a");
                    return closest ? closest.href : null;
                  });
                  if (href && !href.includes("clutch.co")) {
                    websiteUrl = href;
                  }
                }
              } catch (e) {
                // Continue
              }
            }

            // Method 6: Fallback - look for any external link in the website/contact section
            if (!websiteUrl) {
              websiteUrl = await profilePage.evaluate(() => {
                const allLinks = Array.from(
                  document.querySelectorAll("a[href]")
                );
                for (const link of allLinks) {
                  const href = link.href;
                  const text = (link.textContent || "").toLowerCase();
                  const className = (link.className || "").toLowerCase();

                  // Skip clutch/goodfirms links
                  if (
                    href.includes("clutch.co") ||
                    href.includes("goodfirms")
                  ) {
                    continue;
                  }

                  // Must be a proper http/https link
                  if (
                    !href.startsWith("http://") &&
                    !href.startsWith("https://")
                  ) {
                    continue;
                  }

                  // Skip javascript and anchor links
                  if (href.includes("javascript:") || href.includes("#")) {
                    continue;
                  }

                  // Check if it looks like a website link
                  if (
                    text.includes("visit") ||
                    text.includes("website") ||
                    className.includes("btn") ||
                    className.includes("button") ||
                    className.includes("visit") ||
                    className.includes("website")
                  ) {
                    return href;
                  }
                }
                return null;
              });
            }

            if (websiteUrl) {
              companies.push({
                ...listing,
                websiteUrl,
              });
              console.log(`      ✓ Found website: ${websiteUrl}`);
            } else {
              console.log(
                `      ✗ No website found for ${listing.companyName}`
              );
              // Still add the company with profile URL - can be processed later
              companies.push({
                ...listing,
                websiteUrl: listing.profileUrl, // Use profile URL as placeholder
                needsManualReview: true,
              });
            }

            // Small delay between profile visits
            await profilePage.waitForTimeout(1000);
          }
        } catch (e) {
          console.log(`      ✗ Error: ${e.message}`);
          // Still add the company even if there was an error
          companies.push({
            ...listing,
            websiteUrl: listing.profileUrl,
            needsManualReview: true,
          });
        }
      }

      await profilePage.close();
      console.log(`    Extracted ${companies.length} companies with websites`);
      return companies;
    } catch (error) {
      console.error(`Error scraping Clutch: ${error.message}`);
      return [];
    } finally {
      try {
        await page.close();
      } catch (e) {
        // Page might already be closed
      }
    }
  }

  /**
   * Scrape GoodFirms.co directory page
   * @param {string} url - GoodFirms directory URL
   * @returns {Array} - Array of {companyName, websiteUrl, profileUrl}
   */
  static async scrapeGoodFirms(url) {
    await this.init();

    const page = await this.context.newPage();

    try {
      console.log(`  > Scraping GoodFirms: ${url}`);
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      // Wait for listings to load
      await page
        .waitForSelector(".firm-list, .listing, .company-card", {
          timeout: 10000,
        })
        .catch(() => {});

      // Extract company listings from the directory page
      const listings = await page.evaluate(() => {
        const results = [];

        // Try multiple selectors for GoodFirms listings
        const containers = document.querySelectorAll(
          ".firm-listing, .listing-item, .company-card, .firm-card"
        );

        for (const container of containers) {
          try {
            // Company name
            const nameEl =
              container.querySelector("h3 a") ||
              container.querySelector(".firm-name a") ||
              container.querySelector(".company-name a") ||
              container.querySelector("a[href*='/profile/']");
            const name = nameEl?.textContent?.trim() || "";

            // Profile URL (always available)
            const profileUrl = nameEl?.href || "";

            // Try to find website URL on listing page
            const websiteEl =
              container.querySelector("a.website-link") ||
              container.querySelector(
                "a[href*='http']:not([href*='goodfirms'])"
              ) ||
              container.querySelector(".visit-website");

            const websiteUrl = websiteEl?.href || "";

            if (name && profileUrl) {
              results.push({
                companyName: name,
                profileUrl,
                websiteUrl: websiteUrl || null, // null means we need to visit profile page
              });
            }
          } catch (e) {
            // Skip invalid entries
          }
        }

        return results;
      });

      console.log(
        `    Found ${listings.length} company listings from GoodFirms`
      );

      // For companies without website URLs, visit their profile pages
      const companies = [];
      const profilePage = await this.context.newPage();

      for (const listing of listings) {
        try {
          if (listing.websiteUrl) {
            // Already have website URL
            companies.push(listing);
          } else if (listing.profileUrl) {
            // Need to visit profile page to get website
            console.log(`    Visiting profile: ${listing.companyName}`);

            await profilePage.goto(listing.profileUrl, {
              waitUntil: "domcontentloaded",
              timeout: 15000,
            });

            // Extract website URL from profile page
            const websiteUrl = await profilePage.evaluate(() => {
              // Look for website link with multiple selectors
              const selectors = [
                "a.website-link",
                "a[href*='http']:not([href*='goodfirms'])",
                ".firm-website a",
                "a.visit-website",
                ".firm-overview a[href]",
              ];

              for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el && el.href && !el.href.includes("goodfirms")) {
                  return el.href;
                }
              }

              return null;
            });

            if (websiteUrl) {
              companies.push({
                ...listing,
                websiteUrl,
              });
              console.log(`      ✓ Found website: ${websiteUrl}`);
            } else {
              console.log(
                `      ✗ No website found for ${listing.companyName}`
              );
            }

            // Small delay between profile visits
            await profilePage.waitForTimeout(500);
          }
        } catch (e) {
          console.log(`      ✗ Error: ${e.message}`);
        }
      }

      await profilePage.close();
      console.log(`    Extracted ${companies.length} companies with websites`);
      return companies;
    } catch (error) {
      console.error(`Error scraping GoodFirms: ${error.message}`);
      return [];
    } finally {
      await page.close();
    }
  }

  /**
   * Scrape directory based on URL pattern
   * @param {string} url - Directory URL
   * @returns {Array} - Array of company objects
   */
  static async scrapeDirectory(url) {
    if (url.includes("clutch.co")) {
      return await this.scrapeClutch(url);
    } else if (url.includes("goodfirms.co") || url.includes("goodfirms.com")) {
      return await this.scrapeGoodFirms(url);
    } else {
      console.error(`Unknown directory: ${url}`);
      return [];
    }
  }

  /**
   * Get directory URLs for specific cities
   * @returns {Object} - {clutch: [], goodfirms: []}
   */
  static getDirectoryUrls() {
    return {
      clutch: [
        // India
        "https://clutch.co/in/developers/ahmedabad",
        "https://clutch.co/in/developers/bangalore",
        "https://clutch.co/in/developers/hyderabad",
        "https://clutch.co/in/developers/chennai",
        "https://clutch.co/in/developers/pune",
        "https://clutch.co/in/developers/mumbai",
        "https://clutch.co/in/developers/noida",
        "https://clutch.co/in/developers/delhi",
        "https://clutch.co/in/developers/kolkata",
        "https://clutch.co/in/developers/chandigarh",
        // US
        "https://clutch.co/us/software-developers/san-francisco",
        "https://clutch.co/us/software-developers/new-york",
        "https://clutch.co/us/software-developers/seattle",
        "https://clutch.co/us/software-developers/austin",
        "https://clutch.co/us/software-developers/los-angeles",
        "https://clutch.co/us/software-developers/boston",
        "https://clutch.co/us/software-developers/chicago",
        "https://clutch.co/us/software-developers/washington-dc",
        // UK
        "https://clutch.co.uk/software-developers/london",
        "https://clutch.co.uk/software-developers/manchester",
        "https://clutch.co.uk/software-developers/birmingham",
        "https://clutch.co.uk/software-developers/edinburgh",
        "https://clutch.co.uk/software-developers/leeds",
        "https://clutch.co.uk/software-developers/bristol",
        // Canada
        "https://clutch.co/ca/software-developers/toronto",
        "https://clutch.co/ca/software-developers/vancouver",
        "https://clutch.co/ca/software-developers/montreal",
        "https://clutch.co/ca/software-developers/ottawa",
        "https://clutch.co/ca/software-developers/calgary",
        // Australia
        "https://clutch.co.au/software-developers/sydney",
        "https://clutch.co.au/software-developers/melbourne",
        "https://clutch.co.au/software-developers/brisbane",
        "https://clutch.co.au/software-developers/perth",
        "https://clutch.co.au/software-developers/adelaide",
      ],
      goodfirms: [
        // India
        "https://www.goodfirms.co/software-development-companies/india/ahmedabad",
        "https://www.goodfirms.co/software-development-companies/india/bangalore",
        "https://www.goodfirms.co/software-development-companies/india/hyderabad",
        "https://www.goodfirms.co/software-development-companies/india/chennai",
        "https://www.goodfirms.co/software-development-companies/india/pune",
        "https://www.goodfirms.co/software-development-companies/india/mumbai",
        "https://www.goodfirms.co/software-development-companies/india/delhi",
        "https://www.goodfirms.co/software-development-companies/india/kolkata",
        // US
        "https://www.goodfirms.co/software-development-companies/usa/california/san-francisco",
        "https://www.goodfirms.co/software-development-companies/usa/new-york",
        "https://www.goodfirms.co/software-development-companies/usa/texas/austin",
        "https://www.goodfirms.co/software-development-companies/usa/washington/seattle",
        "https://www.goodfirms.co/software-development-companies/usa/california/los-angeles",
        "https://www.goodfirms.co/software-development-companies/usa/massachusetts/boston",
        // UK
        "https://www.goodfirms.co/software-development-companies/uk/london",
        "https://www.goodfirms.co/software-development-companies/uk/manchester",
        "https://www.goodfirms.co/software-development-companies/uk/birmingham",
        // Canada
        "https://www.goodfirms.co/software-development-companies/canada/toronto",
        "https://www.goodfirms.co/software-development-companies/canada/vancouver",
        // Australia
        "https://www.goodfirms.co/software-development-companies/australia/sydney",
        "https://www.goodfirms.co/software-development-companies/australia/melbourne",
      ],
    };
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
