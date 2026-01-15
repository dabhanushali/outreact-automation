import { db } from "../database/db.js";

export class BlogProspectRepo {
  static create(domain, blogName, websiteUrl, sourceQuery = null, sourceType = "blog") {
    const stmt = db.prepare(`
        INSERT INTO blog_prospects (domain, blog_name, website_url, last_source_query, last_source_type)
        VALUES (?, ?, ?, ?, ?)
    `);
    try {
      const info = stmt.run(domain, blogName, websiteUrl, sourceQuery, sourceType);
      return info.lastInsertRowid;
    } catch (e) {
      if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return null; // Duplicate
      }
      throw e;
    }
  }

  static findByDomain(domain) {
    const stmt = db.prepare("SELECT * FROM blog_prospects WHERE domain = ?");
    return stmt.get(domain);
  }

  static markEmailsExtracted(prospectId) {
    const stmt = db.prepare("UPDATE blog_prospects SET emails_extracted = 1 WHERE id = ?");
    stmt.run(prospectId);
  }

  static getUnprocessedProspects(limit = 100) {
    const stmt = db.prepare(`
      SELECT * FROM blog_prospects
      WHERE emails_extracted = 0
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  static linkToCampaign(brandId, campaignId, blogProspectId, sourceQuery, sourceType = "blog") {
    // Since we don't have a leads table for blog prospects yet,
    // this method can be expanded later when blog outreach is implemented
    // For now, we just update the source information on the blog prospect
    const updateProspect = db.prepare(`
      UPDATE blog_prospects
      SET last_source_type = ?,
          last_source_query = ?
      WHERE id = ?
    `);
    updateProspect.run(sourceType, sourceQuery, blogProspectId);

    return true;
  }

  static getAll(limit = 100) {
    const stmt = db.prepare(`
      SELECT * FROM blog_prospects
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  static getCount() {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM blog_prospects");
    return stmt.get().count;
  }

  static getUnprocessedCount() {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM blog_prospects WHERE emails_extracted = 0");
    return stmt.get().count;
  }
}
