import { db } from "../database/db.js";

export class ProspectRepo {
  static create(domain, companyName, websiteUrl, city = null, country = null) {
    const stmt = db.prepare(`
        INSERT INTO prospects (domain, company_name, website_url, city, country)
        VALUES (?, ?, ?, ?, ?)
    `);
    try {
      const info = stmt.run(domain, companyName, websiteUrl, city, country);
      return info.lastInsertRowid;
    } catch (e) {
      if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return null; // Duplicate
      }
      throw e;
    }
  }

  static findByDomain(domain) {
    const stmt = db.prepare("SELECT * FROM prospects WHERE domain = ?");
    return stmt.get(domain);
  }

  static createLead(
    campaignId,
    prospectId,
    sourceQuery,
    sourceType = "google"
  ) {
    const stmt = db.prepare(`
        INSERT INTO leads (campaign_id, prospect_id, source_query, source_type)
        VALUES (?, ?, ?, ?)
    `);
    try {
      stmt.run(campaignId, prospectId, sourceQuery, sourceType);
      return true;
    } catch (e) {
      if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return false; // Already attached to this campaign
      }
      throw e;
    }
  }
}
