import { db } from "../database/db.js";

export class ProspectRepo {
  static create(domain, companyName, websiteUrl, city = null, country = null, prospectType = 'company') {
    const stmt = db.prepare(`
        INSERT INTO prospects (domain, company_name, website_url, city, country, prospect_type)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    try {
      const info = stmt.run(domain, companyName, websiteUrl, city, country, prospectType);
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

  static markEmailsExtracted(prospectId) {
    const stmt = db.prepare("UPDATE prospects SET emails_extracted = 1 WHERE id = ?");
    stmt.run(prospectId);
  }

  static getUnprocessedProspects(limit = 100) {
    const stmt = db.prepare(`
      SELECT * FROM prospects
      WHERE emails_extracted = 0
        AND prospect_type = 'company'
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  static createLead(
    brandId,
    campaignId,
    prospectId,
    sourceQuery,
    sourceType = "google"
  ) {
    const stmt = db.prepare(`
        INSERT INTO leads (brand_id, campaign_id, prospect_id, source_query, source_type)
        VALUES (?, ?, ?, ?, ?)
    `);
    try {
      stmt.run(brandId, campaignId, prospectId, sourceQuery, sourceType);

      // Update prospect's last source information
      const updateProspect = db.prepare(`
        UPDATE prospects
        SET last_source_type = ?,
            last_source_query = ?
        WHERE id = ?
      `);
      updateProspect.run(sourceType, sourceQuery, prospectId);

      return true;
    } catch (e) {
      if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return false; // Already attached to this campaign
      }
      throw e;
    }
  }
}
