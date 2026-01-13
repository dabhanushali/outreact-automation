import { db } from "../database/db.js";
import { ProspectRepo } from "../repositories/ProspectRepo.js";
import { EmailRepo } from "../repositories/EmailRepo.js";
import { GoogleSearch } from "./GoogleSearch.js";
import { SiteVerificationService } from "./SiteVerificationService.js";
import { EmailExtractionService } from "./EmailExtractionService.js";
import { DirectoryScraperService } from "./DirectoryScraperService.js";
import { DailyLimitService } from "./DailyLimitService.js";
import { URL } from "url";

/**
 * Main Outreach Orchestrator
 * Coordinates the complete workflow: Discovery → Verification → Email Extraction
 */
export class OutreachOrchestrator {
  /**
   * Mode A: Organic City Search (Google)
   * @param {string} city - City name
   * @param {number} brandId - Brand ID (optional, will use first brand if not provided)
   * @param {number} campaignId - Campaign ID (optional, will use first campaign if not provided)
   */
  static async runCitySearch(city, brandId = null, campaignId = null) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`      MODE A: ORGANIC CITY SEARCH - ${city}      `);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Get default brand and campaign if not provided
    if (!brandId) {
      brandId = db.prepare("SELECT id FROM brands LIMIT 1").get()?.id;
      if (!brandId) {
        console.error(
          "No brand found in database. Please create a brand first."
        );
        return;
      }
    }
    if (!campaignId) {
      campaignId = db.prepare("SELECT id FROM campaigns LIMIT 1").get()?.id;
      if (!campaignId) {
        console.error(
          "No campaign found in database. Please create a campaign first."
        );
        return;
      }
    }

    const keywords = [
      "software development company",
      "IT services company",
      "web development company",
      "mobile app development company",
    ];

    let addedToday = 0;

    for (const keyword of keywords) {
      // Check daily limit
      if (DailyLimitService.isLimitReached()) {
        console.log(`\n✓ Daily limit reached! Stopping.`);
        break;
      }

      // Match spec: "best software development company in [City Name]"
      const query = `best ${keyword} in ${city}`;
      console.log(`\n> Searching: "${query}"`);

      // Get search results (reduced from 100 to avoid CAPTCHA)
      const results = await GoogleSearch.search(query, 20);

      if (!results || results.length === 0) {
        console.log(`  No results found.`);
        continue;
      }

      console.log(`  Found ${results.length} results. Processing...`);

      // Process each result
      for (const result of results) {
        if (DailyLimitService.isLimitReached()) {
          console.log(`\n✓ Daily limit reached!`);
          break;
        }

        await this.processProspect(
          brandId,
          result.link,
          result.title,
          query,
          campaignId,
          "google"
        );

        addedToday = DailyLimitService.getTodayStats().prospects_added;

        // Small delay between processing
        await new Promise((r) => setTimeout(r, 2000));
      }

      // Delay between searches (increased to avoid CAPTCHA)
      await new Promise((r) => setTimeout(r, 15000));
    }

    DailyLimitService.printStats();
  }

  /**
   * Mode B: Directory Scraping (Clutch/GoodFirms)
   * @param {Array} directoryUrls - Array of directory URLs
   * @param {number} brandId - Brand ID (optional, will use first brand if not provided)
   * @param {number} campaignId - Campaign ID (optional, will use first campaign if not provided)
   */
  static async runDirectoryScraping(
    directoryUrls,
    brandId = null,
    campaignId = null
  ) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`      MODE B: DIRECTORY SCRAPING                  `);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Get default brand and campaign if not provided
    if (!brandId) {
      brandId = db.prepare("SELECT id FROM brands LIMIT 1").get()?.id;
      if (!brandId) {
        console.error(
          "No brand found in database. Please create a brand first."
        );
        return;
      }
    }
    if (!campaignId) {
      campaignId = db.prepare("SELECT id FROM campaigns LIMIT 1").get()?.id;
      if (!campaignId) {
        console.error(
          "No campaign found in database. Please create a campaign first."
        );
        return;
      }
    }

    for (const dirUrl of directoryUrls) {
      if (DailyLimitService.isLimitReached()) {
        console.log(`\n✓ Daily limit reached! Stopping.`);
        break;
      }

      console.log(`\n> Scraping directory: ${dirUrl}`);

      const companies = await DirectoryScraperService.scrapeDirectory(dirUrl);

      if (!companies || companies.length === 0) {
        console.log(`  No companies found.`);
        continue;
      }

      console.log(`  Found ${companies.length} companies. Processing...`);

      // Log first few companies for debugging
      console.log(`  Sample companies found:`);
      companies.slice(0, 3).forEach((c, i) => {
        const needsReview = c.needsManualReview ? " [needs review]" : "";
        console.log(
          `    ${i + 1}. ${c.companyName} → ${c.websiteUrl}${needsReview}`
        );
      });

      // Count companies that need manual review
      const needsReviewCount = companies.filter(
        (c) => c.needsManualReview
      ).length;
      if (needsReviewCount > 0) {
        console.log(
          `  Note: ${needsReviewCount} companies need manual website extraction`
        );
      }

      for (const company of companies) {
        if (DailyLimitService.isLimitReached()) {
          console.log(`\n✓ Daily limit reached!`);
          break;
        }

        // Skip companies that need manual review (they have Clutch profile URLs as placeholders)
        if (company.needsManualReview) {
          console.log(
            `  ⊗ SKIP: ${company.companyName} (needs manual review - saved to database for later)`
          );
          // TODO: Could save these to a separate table for manual review
          continue;
        }

        await this.processProspect(
          brandId,
          company.websiteUrl,
          company.companyName,
          dirUrl,
          campaignId,
          dirUrl.includes("clutch") ? "clutch" : "goodfirms"
        );

        // Delay between processing
        await new Promise((r) => setTimeout(r, 3000));
      }

      // Delay between directories
      await new Promise((r) => setTimeout(r, 10000));
    }

    DailyLimitService.printStats();
  }

  /**
   * Mode C: Search Queries from Database
   * Uses the search_queries table (keyword + city combinations)
   * @param {number} limit - Max queries to process
   */
  /**
   * Mode D: Blog Specific Discovery
   * Finds blog assets based on campaign keywords and search modifiers
   */
  static async runBlogDiscovery() {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`      MODE D: BLOG SPECIFIC DISCOVERY             `);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // 1. Get all campaigns that have keywords
    const campaigns = db
      .prepare("SELECT * FROM campaigns WHERE keywords IS NOT NULL")
      .all();

    if (campaigns.length === 0) {
      console.log("  No campaigns with keywords found.");
      return;
    }

    // 2. Get search modifiers
    const modifiers = db.prepare("SELECT * FROM search_modifiers").all();

    console.log(
      `  Found ${campaigns.length} campaigns and ${modifiers.length} modifiers.`
    );

    for (const campaign of campaigns) {
      if (DailyLimitService.isBlogLimitReached()) {
        console.log(`\n✓ Blog asset daily limit reached (${DailyLimitService.DAILY_BLOG_LIMIT})! Stopping.`);
        break;
      }

      let keywords = [];
      try {
        keywords = JSON.parse(campaign.keywords);
      } catch (e) {
        continue;
      }

      if (keywords.length === 0) continue;

      console.log(`\n> Discovery for Campaign: ${campaign.name}`);
      console.log(`  Target URL: ${campaign.target_url}`);

      // Extract target domain to avoid self-referencing
      let targetDomain = "";
      try {
        const url = new URL(campaign.target_url);
        targetDomain = url.hostname.replace("www.", "");
      } catch (e) {}

      for (const keyword of keywords) {
        if (DailyLimitService.isBlogLimitReached()) break;

        for (const mod of modifiers) {
          if (DailyLimitService.isBlogLimitReached()) break;

          // Footprint: blog + keyword + modifier
          const query = `blog "${keyword}" ${mod.modifier}`;
          console.log(`\n  - Searching: ${query}`);

          const results = await GoogleSearch.search(query, 10);

          if (!results || results.length === 0) {
            console.log(`    No results found.`);
            continue;
          }

          let added = 0;
          for (const result of results) {
            try {
              const resultUrl = new URL(result.link);
              const resultDomain = resultUrl.hostname.replace("www.", "");

              // Skip if it's the target domain or common social/search domains
              if (
                resultDomain === targetDomain ||
                [
                  "google.com",
                  "facebook.com",
                  "twitter.com",
                  "linkedin.com",
                  "instagram.com",
                  "pinterest.com",
                  "youtube.com",
                ].includes(resultDomain)
              ) {
                continue;
              }

              // 1. Store blog asset in campaign_assets
              const stmt = db.prepare(`
                INSERT OR IGNORE INTO campaign_assets (campaign_id, type, title, url)
                VALUES (?, 'blog', ?, ?)
              `);

              const info = stmt.run(campaign.id, result.title, result.link);
              if (info.changes > 0) {
                added++;
                DailyLimitService.incrementBlogAssets();

                // 2. Get or create prospect for this blog domain (marked as 'blog' type)
                let prospectId = ProspectRepo.findByDomain(resultDomain)?.id;

                if (!prospectId) {
                  // Extract company name from title or use domain
                  const companyName = result.title || resultDomain.split('.')[0];
                  const baseUrl = `${resultUrl.protocol}//${resultUrl.hostname}`;

                  // Create prospect with 'blog' type (no email extraction now)
                  prospectId = ProspectRepo.create(
                    resultDomain,
                    companyName,
                    baseUrl,
                    null, // city
                    null, // country
                    'blog' // prospect_type - marked as blog, not company!
                  );

                  if (prospectId) {
                    console.log(`      → Created blog prospect: ${resultDomain}`);

                    // 3. Create lead entry
                    ProspectRepo.createLead(
                      campaign.brand_id,
                      campaign.id,
                      prospectId,
                      query,
                      "blog"
                    );
                  }
                } else {
                  // Prospect already exists, just link to campaign if not already linked
                  const existingLead = db.prepare(
                    "SELECT id FROM leads WHERE prospect_id = ? AND campaign_id = ?"
                  ).get(prospectId, campaign.id);

                  if (!existingLead) {
                    ProspectRepo.createLead(
                      campaign.brand_id,
                      campaign.id,
                      prospectId,
                      query,
                      "blog"
                    );
                  }
                }
              }
            } catch (e) {
              console.error(`      ✗ Error processing blog: ${e.message}`);
            }
          }

          console.log(`    ✓ Discovered ${added} new blog asset(s).`);

          // Rate limit safety
          await new Promise((r) => setTimeout(r, 2000));
        }

        // Delay between keyword batches
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    DailyLimitService.printStats();
  }

  static async runFromSearchQueries(limit = 10) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`      MODE C: SEARCH QUERIES FROM DATABASE        `);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Get a brand and campaign
    const brandId = db.prepare("SELECT id FROM brands LIMIT 1").get()?.id;
    const campaignId = db.prepare("SELECT id FROM campaigns LIMIT 1").get()?.id;

    if (!brandId || !campaignId) {
      console.error(
        "No brand or campaign found. Please run InputParser first."
      );
      return;
    }

    // Get unprocessed search queries
    const queries = db
      .prepare(
        `
        SELECT sq.*, ok.phrase, c.name as city
        FROM search_queries sq
        JOIN outreach_keywords ok ON sq.keyword_id = ok.id
        JOIN cities c ON sq.city_id = c.id
        ORDER BY RANDOM()
        LIMIT ?
      `
      )
      .all(limit);

    console.log(`  Processing ${queries.length} search queries...`);

    let processed = 0;

    for (const queryRow of queries) {
      if (DailyLimitService.isLimitReached()) {
        console.log(`\n✓ Daily limit reached! Stopping.`);
        break;
      }

      console.log(`\n[${processed + 1}/${queries.length}] ${queryRow.query}`);
      console.log(`  Keyword: "${queryRow.phrase}" | City: ${queryRow.city}`);

      // Search Google
      const results = await GoogleSearch.search(queryRow.query, 10);

      if (!results || results.length === 0) {
        console.log(`  No results found.`);
        continue;
      }

      console.log(`  Found ${results.length} results. Processing...`);

      // Process each result
      for (const result of results) {
        if (DailyLimitService.isLimitReached()) {
          console.log(`\n✓ Daily limit reached!`);
          break;
        }

        await this.processProspect(
          brandId,
          result.link,
          result.title,
          queryRow.query,
          campaignId,
          "google"
        );

        // Small delay
        await new Promise((r) => setTimeout(r, 2000));
      }

      processed++;

      // Delay between searches
      await new Promise((r) => setTimeout(r, 5000));
    }

    DailyLimitService.printStats();
  }

  /**
   * Process a single prospect through the full workflow
   * @param {number} brandId - Brand ID
   * @param {string} websiteUrl - The website URL
   * @param {string} companyName - The company name
   * @param {string} sourceQuery - The search query/source
   * @param {number} campaignId - Campaign ID
   * @param {string} sourceType - Source type (google, clutch, goodfirms, etc.)
   */
  static async processProspect(
    brandId,
    websiteUrl,
    companyName,
    sourceQuery,
    campaignId,
    sourceType = "google"
  ) {
    try {
      // Extract domain
      const url = new URL(websiteUrl);
      let domain = url.hostname;
      if (domain.startsWith("www.")) domain = domain.substring(4);

      // Directory domains that should be scraped for company listings
      const directoryDomains = [
        "clutch.co",
        "clutch.com",
        "goodfirms.co",
        "goodfirms.com",
        "glassdoor.co.in",
        "glassdoor.com",
        "builtin.com",
        "builtinpune.in",
        "sharpener.tech",
        "techreviewer.co",
      ];

      // Check if this is a known directory page
      for (const dirDomain of directoryDomains) {
        if (domain === dirDomain || domain.endsWith("." + dirDomain)) {
          console.log(`  📂 Directory detected: ${domain}`);
          console.log(`     Scraping for company listings...`);

          // Scrape this directory page for companies
          const companies = await DirectoryScraperService.scrapeDirectory(
            websiteUrl
          );

          if (companies && companies.length > 0) {
            console.log(
              `     ✓ Found ${companies.length} companies from directory`
            );

            // Process each company from the directory
            for (const company of companies) {
              if (DailyLimitService.isLimitReached()) {
                console.log(
                  `     ✓ Daily limit reached during directory processing`
                );
                break;
              }

              // Recursively process each company found
              await this.processProspect(
                brandId,
                company.websiteUrl,
                company.companyName,
                websiteUrl, // Source query = the directory URL
                campaignId,
                dirDomain.includes("clutch")
                  ? "clutch"
                  : dirDomain.includes("goodfirms")
                  ? "goodfirms"
                  : "directory"
              );

              // Small delay between processing companies
              await new Promise((r) => setTimeout(r, 2000));
            }
          } else {
            console.log(`     ✗ No companies found in directory`);
          }

          // Don't process the directory page itself as a company
          return;
        }
      }

      // Step 1: Check exclusion database (duplicates)
      const existing = ProspectRepo.findByDomain(domain);
      if (existing) {
        console.log(`  ⊗ SKIP: ${domain} (already exists)`);
        return;
      }

      console.log(`  → Processing: ${companyName || domain} (${domain})`);

      // Step 2: Site Verification (Keyword/AI Check)
      console.log(`    [1/3] Verifying site...`);
      const verification = await SiteVerificationService.verify(websiteUrl);

      if (!verification.isVerified) {
        console.log(`    ✗ Verification failed: ${verification.reasoning}`);
        // Optionally save to prospect_verification table
        return;
      }

      console.log(`    ✓ Verified: ${verification.reasoning}`);

      // Create prospect
      const prospectId = ProspectRepo.create(
        domain,
        companyName || domain.split(".")[0],
        websiteUrl
      );

      if (!prospectId) {
        console.log(`    ⊗ Failed to create prospect`);
        return;
      }

      // Create lead
      ProspectRepo.createLead(
        brandId,
        campaignId,
        prospectId,
        sourceQuery,
        sourceType
      );

      // Increment daily counter
      DailyLimitService.incrementProspects();

      console.log(`    ✓ Prospect added (ID: ${prospectId})`);
      console.log(`    ℹ Emails will be extracted separately (run extract-emails mode)`);
    } catch (error) {
      console.error(`  ✗ Error processing ${websiteUrl}: ${error.message}`);
    }
  }

  /**
   * Mode E: Email Extraction for New Prospects
   * Extracts emails for newly added prospects (company type only, not blogs)
   */
  static async extractEmailsForNewProspects() {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`      MODE E: EMAIL EXTRACTION                    `);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Get unprocessed prospects (company type only)
    const prospects = ProspectRepo.getUnprocessedProspects(100);

    if (prospects.length === 0) {
      console.log(`  No unprocessed prospects found.`);
      console.log(`  All prospects already have emails extracted.`);
      return;
    }

    console.log(`  Found ${prospects.length} unprocessed prospects.\n`);

    let processed = 0;
    let emailsFound = 0;

    for (const prospect of prospects) {
      console.log(`\n[${processed + 1}/${prospects.length}] ${prospect.domain} - ${prospect.company_name || 'Unknown'}`);

      // Extract emails from website
      console.log(`  → Extracting emails from ${prospect.website_url}...`);
      const emails = await EmailExtractionService.extractFromWebsite(
        prospect.website_url
      );

      if (emails.length === 0) {
        console.log(`  ✗ No emails found`);
        // Mark as processed even if no emails found
        ProspectRepo.markEmailsExtracted(prospect.id);
        processed++;
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      console.log(`  ✓ Found ${emails.length} email(s)`);

      let emailsAdded = 0;

      for (const emailData of emails) {
        // Check if email already exists
        if (EmailRepo.exists(emailData.email)) {
          console.log(`    ⊗ ${emailData.email} (duplicate)`);
          continue;
        }

        // Validate and classify email
        const isDomainMatch = EmailExtractionService.isDomainMatch(
          emailData.email,
          prospect.website_url
        );
        const isGeneric = EmailExtractionService.isGeneric(emailData.email);

        // Calculate confidence score
        let confidence = 100;
        if (!isDomainMatch) confidence -= 30;
        if (isGeneric) confidence -= 20;

        // Only save if reasonable confidence
        if (confidence >= 50) {
          EmailRepo.create(
            prospect.id,
            emailData.email,
            emailData.sourcePage,
            isDomainMatch,
            isGeneric,
            confidence
          );
          emailsAdded++;
          emailsFound++;

          const matchIndicator = isDomainMatch ? "✓" : "○";
          const genericIndicator = isGeneric ? "📧" : "👤";
          console.log(
            `    ${matchIndicator} ${genericIndicator} ${emailData.email} (${confidence}%)`
          );
        }
      }

      if (emailsAdded > 0) {
        console.log(`  ✓ ${emailsAdded} email(s) saved to database`);
      }

      // Mark as processed
      ProspectRepo.markEmailsExtracted(prospect.id);

      // Update lead status
      const bestEmail = EmailRepo.getBestEmail(prospect.id);
      if (bestEmail) {
        // Has email → Ready for outreach
        db.prepare(
          "UPDATE leads SET status = ? WHERE prospect_id = ?"
        ).run("READY", prospect.id);
        console.log(`  ✓ Lead status: READY (has email)`);
      } else {
        console.log(`  ℹ Lead status: NEW (no email found)`);
      }

      processed++;

      // Delay between processing (human-like)
      await new Promise((r) => setTimeout(r, 3000));
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`           EMAIL EXTRACTION COMPLETE              `);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Prospects Processed: ${processed}/${prospects.length}`);
    console.log(`  Total Emails Found:  ${emailsFound}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    DailyLimitService.printStats();
  }

  /**
   * Close all services
   */
  static async cleanup() {
    await GoogleSearch.close();
    await SiteVerificationService.close();
    await EmailExtractionService.close();
    await DirectoryScraperService.close();
  }
}
