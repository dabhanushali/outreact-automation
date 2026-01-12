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
   * @param {number} brandId - Brand ID
   * @param {number} campaignId - Campaign ID
   */
  static async runCitySearch(city, brandId, campaignId) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`      MODE A: ORGANIC CITY SEARCH - ${city}      `);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const keywords = [
      "software development company",
      "IT services company",
      "custom software development",
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

      const query = `${keyword} ${city}`;
      console.log(`\n> Searching: "${query}"`);

      // Get search results
      const results = await GoogleSearch.search(query, 10);

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

      // Delay between searches
      await new Promise((r) => setTimeout(r, 5000));
    }

    DailyLimitService.printStats();
  }

  /**
   * Mode B: Directory Scraping (Clutch/GoodFirms)
   * @param {Array} directoryUrls - Array of directory URLs
   * @param {number} brandId - Brand ID
   * @param {number} campaignId - Campaign ID
   */
  static async runDirectoryScraping(directoryUrls, brandId, campaignId) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`      MODE B: DIRECTORY SCRAPING                  `);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

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
        console.log(`    ${i + 1}. ${c.companyName} → ${c.websiteUrl}${needsReview}`);
      });

      // Count companies that need manual review
      const needsReviewCount = companies.filter((c) => c.needsManualReview).length;
      if (needsReviewCount > 0) {
        console.log(`  Note: ${needsReviewCount} companies need manual website extraction`);
      }

      for (const company of companies) {
        if (DailyLimitService.isLimitReached()) {
          console.log(`\n✓ Daily limit reached!`);
          break;
        }

        // Skip companies that need manual review (they have Clutch profile URLs as placeholders)
        if (company.needsManualReview) {
          console.log(`  ⊗ SKIP: ${company.companyName} (needs manual review - saved to database for later)`);
          // TODO: Could save these to a separate table for manual review
          continue;
        }

        await this.processProspect(
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
  static async runFromSearchQueries(limit = 10) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`      MODE C: SEARCH QUERIES FROM DATABASE        `);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Get a brand and campaign
    const brandId = db
      .prepare("SELECT id FROM brands LIMIT 1")
      .get()?.id;
    const campaignId = db
      .prepare("SELECT id FROM campaigns LIMIT 1")
      .get()?.id;

    if (!brandId || !campaignId) {
      console.error("No brand or campaign found. Please run InputParser first.");
      return;
    }

    // Get unprocessed search queries
    const queries = db
      .prepare(`
        SELECT sq.*, ok.phrase, c.name as city
        FROM search_queries sq
        JOIN outreach_keywords ok ON sq.keyword_id = ok.id
        JOIN cities c ON sq.city_id = c.id
        ORDER BY RANDOM()
        LIMIT ?
      `)
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
   * @param {string} websiteUrl - The website URL
   * @param {string} companyName - The company name
   * @param {string} sourceQuery - The search query/source
   * @param {number} campaignId - Campaign ID
   * @param {string} sourceType - Source type (google, clutch, goodfirms, etc.)
   */
  static async processProspect(
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

      // Filter out directory domains (we want company websites, not directories)
      const excludedDomains = [
        "clutch.co",
        "clutch.com",
        "goodfirms.co",
        "goodfirms.com",
        "directory.com",
        "listings.com",
      ];

      for (const excluded of excludedDomains) {
        if (domain === excluded || domain.endsWith("." + excluded)) {
          console.log(`  ⊗ SKIP: ${domain} (directory domain - not a company)`);
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
      ProspectRepo.createLead(campaignId, prospectId, sourceQuery, sourceType);

      // Increment daily counter
      DailyLimitService.incrementProspects();

      console.log(`    ✓ Prospect added (ID: ${prospectId})`);

      // Step 3: Email Extraction
      console.log(`    [2/3] Extracting emails...`);
      const emails = await EmailExtractionService.extractFromWebsite(websiteUrl);

      if (emails.length === 0) {
        console.log(`    ✗ No emails found`);
        return;
      }

      console.log(`    ✓ Found ${emails.length} email(s)`);

      let emailsAdded = 0;

      for (const emailData of emails) {
        // Check if email already exists
        if (EmailRepo.exists(emailData.email)) {
          console.log(`      ⊗ ${emailData.email} (duplicate)`);
          continue;
        }

        // Validate and classify email
        const isDomainMatch = EmailExtractionService.isDomainMatch(
          emailData.email,
          websiteUrl
        );
        const isGeneric = EmailExtractionService.isGeneric(emailData.email);

        // Calculate confidence score
        let confidence = 100;
        if (!isDomainMatch) confidence -= 30;
        if (isGeneric) confidence -= 20;

        // Only save if reasonable confidence
        if (confidence >= 50) {
          EmailRepo.create(
            prospectId,
            emailData.email,
            emailData.sourcePage,
            isDomainMatch,
            isGeneric,
            confidence
          );
          emailsAdded++;
          DailyLimitService.incrementEmails();

          const matchIndicator = isDomainMatch ? "✓" : "○";
          const genericIndicator = isGeneric ? "📧" : "👤";
          console.log(
            `      ${matchIndicator} ${genericIndicator} ${emailData.email} (${confidence}%)`
          );
        }
      }

      if (emailsAdded > 0) {
        console.log(`    ✓ ${emailsAdded} email(s) saved to database`);
      }

      // Update lead status
      const bestEmail = EmailRepo.getBestEmail(prospectId);
      if (bestEmail) {
        db.prepare(
          "UPDATE leads SET status = ? WHERE prospect_id = ? AND campaign_id = ?"
        ).run("EMAIL_FOUND", prospectId, campaignId);
        console.log(`    [3/3] Lead status: EMAIL_FOUND`);
      } else {
        db.prepare(
          "UPDATE leads SET status = ? WHERE prospect_id = ? AND campaign_id = ?"
        ).run("VERIFIED", prospectId, campaignId);
        console.log(`    [3/3] Lead status: VERIFIED (no email)`);
      }

      const stats = DailyLimitService.getTodayStats();
      console.log(`    Daily progress: ${stats.prospects_added}/${DailyLimitService.DAILY_LIMIT}`);
    } catch (error) {
      console.error(`  ✗ Error processing ${websiteUrl}: ${error.message}`);
    }
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
