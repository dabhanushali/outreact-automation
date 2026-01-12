import { URL } from "url";
import { db } from "../database/db.js";
import { ProspectRepo } from "../repositories/ProspectRepo.js";
import { GoogleSearch } from "./GoogleSearch.js";

export class SearchService {
  static async searchWeb(query, campaignId) {
    console.log(`  > Google Search: "${query}"`);

    const results = await GoogleSearch.search(query, 10);

    if (!results || results.length === 0) {
      console.log("    No results found.");
      return 0;
    }

    let newLeads = 0;

    for (const result of results) {
      const link = result.link;
      if (!link) continue;

      try {
        const parsed = new URL(link);
        // Domain extraction
        let domain = parsed.hostname;
        if (domain.startsWith("www.")) domain = domain.substring(4);

        // Basic filtering
        if (
          [
            "facebook.com",
            "linkedin.com",
            "twitter.com",
            "instagram.com",
          ].includes(domain)
        )
          continue;

        // Company Name heuristic
        let companyName = domain.split(".")[0];
        companyName =
          companyName.charAt(0).toUpperCase() + companyName.slice(1);

        // 1. Create/Find Prospect
        let prospectId = null;
        const existing = ProspectRepo.findByDomain(domain);

        if (existing) {
          prospectId = existing.id;
        } else {
          prospectId = ProspectRepo.create(domain, companyName, link);
          if (prospectId) {
            console.log(`    [NEW] ${companyName} (${domain})`);
            newLeads++;
          } else {
            // Race condition or existing
            const retry = ProspectRepo.findByDomain(domain);
            if (retry) prospectId = retry.id;
          }
        }

        // 2. Link to Campaign (Lead)
        if (prospectId) {
          ProspectRepo.createLead(
            campaignId,
            prospectId,
            query,
            "google"
          );
        }
      } catch (e) {
        // Invalid URL
      }
    }

    return newLeads;
  }

  static async runCampaign(campaignId) {
    // Fetch campaign details
    const campaign = db
      .prepare("SELECT * FROM campaigns WHERE id = ?")
      .get(campaignId);
    if (!campaign) {
      console.error(`Campaign ${campaignId} not found.`);
      return;
    }

    console.log(`\nRunning Campaign: ${campaign.name}`);

    // Parse Keywords
    let keywords = [];
    try {
      keywords = JSON.parse(campaign.keywords || "[]");
    } catch (e) {
      console.warn(`  Failed to parse keywords for ${campaign.name}`);
    }

    if (keywords.length === 0) {
      console.log("  No keywords found. Skipping.");
      return;
    }

    // Just run first 2 keywords for MVP
    const limitedKeywords = keywords.slice(0, 2);

    let totalNew = 0;
    for (const kw of limitedKeywords) {
      // Generate full query
      // If it's a Blog campaign, we might want to append modifiers if not present?
      // "Where <keyword> rotates through..."
      // Usually we add: + "write for us"

      // For MVP, assuming keyword IS the query or close to it.
      // Let's modify:
      const query = `${kw} "write for us"`;

      const count = await this.searchWeb(query, campaignId);
      totalNew += count;

      // Rate Limit safety
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log(`  Campaign Complete. New Leads: ${totalNew}`);
  }
}
