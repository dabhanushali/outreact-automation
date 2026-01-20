import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import DirectoryRepo from "../repositories/DirectoryRepo.js";

// Add stealth plugin
chromium.use(stealthPlugin());

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
    if (this.browser && this.browser.isConnected()) return this.browser;

    this.browser = await chromium.launch({
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

    return this.browser;
  }

  /**
   * Resolves a directory redirect URL to the final destination
   * @param {string} url - The redirect URL
   * @returns {Promise<string>} - The resolved final URL
   */
  static async resolveWebsiteUrl(url) {
    if (!url || !url.startsWith("http")) return url;

    // Clutch redirects often have the target URL in the 'u' parameter
    if (url.includes("r.clutch.co") || url.includes("ppc.clutch.co")) {
      try {
        const urlObj = new URL(url);
        const target =
          urlObj.searchParams.get("u") ||
          urlObj.searchParams.get("provider_website");
        if (target) {
          // Decode URL if necessary
          const decoded = target.startsWith("http")
            ? target
            : `http://${target}`;
          return decoded.split("?")[0]; // Clean UTM if wanted, but standard is often safer
        }
      } catch (e) {
        // Fallback to following if decoding fails
      }
    }

    // For GoodFirms or if Clutch extraction failed, follow the redirect
    if (url.includes("goodfirms.co") || url.includes("clutch.co")) {
      await this.init();
      const page = await this.context.newPage();
      try {
        // We only care about the final URL, so we can stop as soon as we land
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        const finalUrl = page.url();
        // Skip if still on the directory
        if (
          finalUrl.includes("clutch.co") ||
          finalUrl.includes("goodfirms.co")
        ) {
          return url.split("?")[0];
        }
        return finalUrl.split("?")[0];
      } catch (e) {
        return url.split("?")[0];
      } finally {
        await page.close();
      }
    }

    // Proactively clean UTM for any URL
    return url.split("?")[0];
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
      let profilePage = await this.context.newPage();

      for (const listing of listings) {
        try {
          if (listing.websiteUrl && !listing.websiteUrl.includes("clutch.co")) {
            // Already have website URL and it's not a clutch URL
            companies.push(listing);
          } else if (listing.profileUrl) {
            // Need to visit profile page to get website
            console.log(`    Visiting profile: ${listing.companyName}`);

            try {
              // Ensure browser, context and page are valid
              try {
                if (
                  !this.browser ||
                  !this.browser.isConnected() ||
                  !this.context
                ) {
                  await this.init();
                  profilePage = await this.context.newPage();
                } else if (
                  profilePage.isClosed() ||
                  (this.context && !this.context.pages().includes(profilePage))
                ) {
                  profilePage = await this.context.newPage();
                }
              } catch (resurrectionError) {
                console.log(
                  `      ⚠ Critical session failure, restarting browser: ${resurrectionError.message}`
                );
                this.browser = null; // Force init to create new browser
                await this.init();
                profilePage = await this.context.newPage();
              }

              await profilePage.goto(listing.profileUrl, {
                waitUntil: "domcontentloaded",
                timeout: 30000,
              });

              // Sanity Check: Ensure we are on a real profile page
              const isRealProfile = await profilePage
                .waitForSelector("#profile-summary, .profile-header", {
                  timeout: 10000,
                })
                .then(() => true)
                .catch(() => false);

              if (!isRealProfile) {
                console.log(
                  `      ⚠ Blocked or invalid profile page for ${listing.companyName}`
                );
                const isBlocked = await profilePage.evaluate(
                  () =>
                    document.title.includes("Cloudflare") ||
                    document.title.includes("Just a moment")
                );
                if (isBlocked) {
                  console.log(`      ✗ Cloudflare block detected. skipping.`);
                  continue;
                }
              }
            } catch (gotoError) {
              console.log(`      ✗ Navigation error: ${gotoError.message}`);
              if (gotoError.message.includes("closed")) {
                profilePage = await this.context.newPage();
              }
              continue;
            }

            // Wait for dynamic content
            await profilePage.waitForTimeout(2000);

            // Improved Extraction Methods for Clutch Profile Page
            let websiteUrl = null;
            try {
              websiteUrl = await profilePage.evaluate(() => {
                const links = Array.from(document.querySelectorAll("a[href]"));
                const forbiddenDomains = [
                  "facebook.com",
                  "linkedin.com",
                  "twitter.com",
                  "instagram.com",
                  "google.com",
                  "youtube.com",
                  "pinterest.com",
                  "cloudflare.com",
                  "captcha",
                  "challenge-platform",
                  "x.com",
                  "apple.com",
                  "microsoft.com",
                  "hsforms.com",
                  "hubspot.com",
                  "typeform.com",
                  "calendly.com",
                  "zoom.us",
                  "googletagmanager.com",
                ];

                const isInternal = (href) => {
                  const url = href.toLowerCase();
                  if (
                    url.includes("r.clutch.co") ||
                    url.includes("ppc.clutch.co")
                  )
                    return false;
                  if (
                    url.includes("clutch.co") ||
                    url.includes("goodfirms.co") ||
                    url.includes("goodfirms.com")
                  )
                    return true;
                  return false;
                };

                // First pass: Look for high-intent "Visit Website" links or buttons
                for (const link of links) {
                  const href = link.href;
                  const text = (link.textContent || "").toLowerCase();
                  const className = (link.className || "").toLowerCase();

                  if (
                    isInternal(href) ||
                    forbiddenDomains.some((domain) => href.includes(domain))
                  ) {
                    continue;
                  }

                  // Check for high-intent patterns
                  if (
                    text.includes("visit website") ||
                    text.includes("visit site") ||
                    text.includes("go to website") ||
                    className.includes("visit-website") ||
                    className.includes("website-link") ||
                    className.includes("visit-site") ||
                    link.querySelector(".icon-globe") ||
                    link.querySelector("path[d*='M12 2C6.48 2 2 6.48 2 12']")
                  ) {
                    return href;
                  }
                }

                // Second pass: Fallback to any external-looking business link
                for (const link of links) {
                  const href = link.href;

                  if (
                    href.startsWith("http") &&
                    !isInternal(href) &&
                    !forbiddenDomains.some((domain) => href.includes(domain))
                  ) {
                    return href;
                  }
                }
                return null;
              });
            } catch (extractionError) {
              console.log(
                `      ✗ Extraction error: ${extractionError.message}`
              );
            }

            if (websiteUrl) {
              companies.push({
                ...listing,
                websiteUrl: await this.resolveWebsiteUrl(websiteUrl),
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
        .waitForSelector(".firm-list, .listing, .company-card, .firm-wrapper", {
          timeout: 10000,
        })
        .catch(() => {});

      // Extract company listings from the directory page
      const listings = await page.evaluate(() => {
        const results = [];

        // Try multiple selectors for GoodFirms listings
        const containers = document.querySelectorAll(
          ".firm-listing, .listing-item, .company-card, .firm-card, .firm-wrapper"
        );

        for (const container of containers) {
          try {
            // Company name
            const nameEl =
              container.querySelector("h3 a") ||
              container.querySelector(".firm-name a") ||
              container.querySelector(".company-name a") ||
              container.querySelector(".visit-profile") ||
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
      let profilePage = await this.context.newPage();

      for (const listing of listings) {
        try {
          // Recreate page if it was closed
          if (
            profilePage.isClosed() ||
            (this.context && !this.context.pages().includes(profilePage))
          ) {
            profilePage = await this.context.newPage();
          }

          if (listing.websiteUrl && !listing.websiteUrl.includes("goodfirms")) {
            // Already have website URL
            companies.push(listing);
          } else if (listing.profileUrl) {
            // Need to visit profile page to get website
            console.log(`    Visiting profile: ${listing.companyName}`);

            try {
              // Ensure browser, context and page are valid
              try {
                if (
                  !this.browser ||
                  !this.browser.isConnected() ||
                  !this.context
                ) {
                  await this.init();
                  profilePage = await this.context.newPage();
                } else if (
                  profilePage.isClosed() ||
                  (this.context && !this.context.pages().includes(profilePage))
                ) {
                  profilePage = await this.context.newPage();
                }
              } catch (resurrectionError) {
                console.log(
                  `      ⚠ Critical session failure, restarting browser: ${resurrectionError.message}`
                );
                this.browser = null; // Force init to create new browser
                await this.init();
                profilePage = await this.context.newPage();
              }

              await profilePage.goto(listing.profileUrl, {
                waitUntil: "domcontentloaded",
                timeout: 30000,
              });

              // Sanity Check for GoodFirms
              const isRealProfile = await profilePage
                .waitForSelector(
                  ".firm-overview, .profile-header, .firm-vitals",
                  { timeout: 10000 }
                )
                .then(() => true)
                .catch(() => false);

              if (!isRealProfile) {
                console.log(
                  `      ⚠ Blocked or invalid profile page for ${listing.companyName}`
                );
                const isBlocked = await profilePage.evaluate(
                  () =>
                    document.title.includes("Cloudflare") ||
                    document.title.includes("Just a moment")
                );
                if (isBlocked) {
                  console.log(`      ✗ Cloudflare block detected. skipping.`);
                  continue;
                }
              }
            } catch (gotoError) {
              console.log(`      ✗ Navigation error: ${gotoError.message}`);
              if (gotoError.message.includes("closed")) {
                profilePage = await this.context.newPage();
              }
              continue;
            }

            // Extract website URL from profile page
            const websiteUrl = await profilePage.evaluate(() => {
              const links = Array.from(document.querySelectorAll("a[href]"));
              const forbiddenDomains = [
                "facebook.com",
                "linkedin.com",
                "twitter.com",
                "instagram.com",
                "google.com",
                "youtube.com",
                "pinterest.com",
                "cloudflare.com",
                "captcha",
                "x.com",
                "hsforms.com",
                "hubspot.com",
                "typeform.com",
                "calendly.com",
                "zoom.us",
                "googletagmanager.com",
              ];

              const isInternal = (href) => {
                const url = href.toLowerCase();
                if (
                  url.includes("goodfirms.co") ||
                  url.includes("goodfirms.com") ||
                  url.includes("clutch.co")
                )
                  return true;
                return false;
              };

              for (const link of links) {
                const href = link.href;
                const text = (link.textContent || "").toLowerCase();
                const className = (link.className || "").toLowerCase();

                if (
                  isInternal(href) ||
                  forbiddenDomains.some((domain) => href.includes(domain))
                )
                  continue;

                if (
                  text.includes("visit website") ||
                  text.includes("visit site") ||
                  className.includes("visit-website") ||
                  className.includes("website-link") ||
                  className.includes("visit-site")
                ) {
                  return href;
                }
              }

              // Fallback
              for (const link of links) {
                const href = link.href;
                if (
                  href.startsWith("http") &&
                  !isInternal(href) &&
                  !forbiddenDomains.some((domain) => href.includes(domain))
                ) {
                  return href;
                }
              }

              return null;
            });

            if (websiteUrl) {
              companies.push({
                ...listing,
                websiteUrl: await this.resolveWebsiteUrl(websiteUrl),
              });
              console.log(`      ✓ Found website: ${websiteUrl}`);
            } else {
              console.log(
                `      ✗ No website found for ${listing.companyName}`
              );
              companies.push({
                ...listing,
                websiteUrl: listing.profileUrl,
                needsManualReview: true,
              });
            }

            // Human-like delay
            await profilePage.waitForTimeout(1000 + Math.random() * 1000);
          }
        } catch (e) {
          console.log(`      ✗ Error for ${listing.companyName}: ${e.message}`);
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
      console.log(`  > Using generic scraper for: ${url}`);
      return await this.scrapeGeneric(url);
    }
  }

  /**
   * Generic directory scraper for unknown directory sites
   * Attempts to extract company listings from any directory-style page
   * @param {string} url - Directory URL
   * @returns {Array} - Array of {companyName, websiteUrl, profileUrl}
   */
  static async scrapeGeneric(url) {
    let page = null;
    try {
      await this.init();
      if (!this.context) throw new Error("Browser context not initialized");
      page = await this.context.newPage();

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Wait for content to load
      await page.waitForTimeout(3000);

      // Extract company listings using generic selectors
      const listings = await page.evaluate(() => {
        const results = [];

        // Try various container selectors that might hold company listings
        const containerSelectors = [
          "article",
          ".company",
          ".listing",
          ".item",
          ".card",
          "li",
          ".result",
          "[class*='company']",
          "[class*='listing']",
          "[class*='item']",
        ];

        let mainContainer = null;
        for (const selector of containerSelectors) {
          const containers = document.querySelectorAll(selector);
          if (containers.length > 3) {
            // Found a reasonable number of items
            mainContainer = document.body;
            break;
          }
        }

        const potentialContainers = document.querySelectorAll(
          "article, .company, .listing, .item, .card, li, [class*='company'], [class*='listing'], [class*='result']"
        );

        for (const container of potentialContainers) {
          try {
            const text = container.textContent?.trim() || "";
            if (text.length < 50) continue;

            if (
              text.includes("See more") ||
              text.includes("Load more") ||
              text.includes("Showing")
            ) {
              continue;
            }

            const links = container.querySelectorAll("a[href]");
            if (links.length === 0) continue;

            let companyName = "";
            let websiteUrl = "";
            let profileUrl = "";

            const heading = container.querySelector("h1, h2, h3, h4, h5, h6");
            if (heading) {
              companyName = heading.textContent?.trim() || "";
            }

            if (!companyName) {
              for (const link of links) {
                const linkText = link.textContent?.trim();
                if (linkText && linkText.length > 5 && linkText.length < 100) {
                  companyName = linkText;
                  break;
                }
              }
            }

            const currentUrl = window.location.hostname;
            for (const link of links) {
              const href = link.href;
              if (
                !href ||
                href.startsWith("#") ||
                href.startsWith("javascript:")
              )
                continue;

              try {
                const linkDomain = new URL(href).hostname;
                if (
                  linkDomain === currentUrl ||
                  linkDomain.endsWith("." + currentUrl)
                ) {
                  if (!profileUrl) profileUrl = href;
                  continue;
                }
                websiteUrl = href;
                break;
              } catch (e) {
                continue;
              }
            }

            if (
              companyName &&
              companyName.length > 3 &&
              companyName.length < 200
            ) {
              results.push({
                companyName: companyName,
                websiteUrl: websiteUrl || null,
                profileUrl: profileUrl || null,
              });
            }
          } catch (e) {}
        }

        return results;
      });

      console.log(`    Found ${listings.length} potential company listings`);

      const companies = listings.filter(
        (listing) => listing.websiteUrl && listing.websiteUrl.length > 0
      );

      console.log(
        `    ✓ Extracted ${companies.length} companies with websites`
      );

      return companies;
    } catch (error) {
      console.error(`Error scraping generic directory: ${error.message}`);
      return [];
    } finally {
      if (page && !page.isClosed()) {
        try {
          await page.close();
        } catch (e) {}
      }
    }
  }

  /**
   * Get directory URLs for specific cities
   * @param {Object} filters - Optional filters {platform, country, is_active}
   * @returns {Object} - {clutch: [], goodfirms: []}
   */
  static getDirectoryUrls(filters = {}) {
    // Get directories from database
    const directories = DirectoryRepo.getActive(filters);

    // Group by platform for backward compatibility
    const result = {
      clutch: [],
      goodfirms: [],
      other: []
    };

    for (const dir of directories) {
      if (result[dir.platform]) {
        result[dir.platform].push(dir.url);
      } else {
        result.other.push(dir.url);
      }
    }

    return result;
  }

  /**
   * Get directory URLs as flat array (for scraping)
   * @param {Object} filters - Optional filters {platform, country}
   * @returns {Array} - Array of directory objects with id, name, url, platform
   */
  static getDirectories(filters = {}) {
    return DirectoryRepo.getActive(filters);
  }

  /**
   * Update directory scrape stats
   * @param {number} directoryId - Directory ID
   * @param {number} companiesFound - Number of companies found
   */
  static updateDirectoryStats(directoryId, companiesFound) {
    DirectoryRepo.updateScrapeStats(directoryId, companiesFound);
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
