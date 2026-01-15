import { db } from "../database/db.js";

export class BlogLeadRepo {
  /**
   * Create a blog lead (links blog prospect to campaign)
   */
  static createLead(
    brandId,
    campaignId,
    blogProspectId,
    sourceQuery,
    sourceType = "blog"
  ) {
    const stmt = db.prepare(`
        INSERT INTO blog_leads (brand_id, campaign_id, blog_prospect_id, source_query, source_type)
        VALUES (?, ?, ?, ?, ?)
    `);
    try {
      stmt.run(brandId, campaignId, blogProspectId, sourceQuery, sourceType);

      // Update blog prospect's last source information
      const updateProspect = db.prepare(`
        UPDATE blog_prospects
        SET last_source_type = ?,
            last_source_query = ?
        WHERE id = ?
      `);
      updateProspect.run(sourceType, sourceQuery, blogProspectId);

      return true;
    } catch (e) {
      if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return false; // Already attached to this campaign
      }
      throw e;
    }
  }

  /**
   * Find blog lead by blog prospect ID and campaign ID
   */
  static findByProspectAndCampaign(blogProspectId, campaignId) {
    const stmt = db.prepare(`
      SELECT * FROM blog_leads
      WHERE blog_prospect_id = ? AND campaign_id = ?
    `);
    return stmt.get(blogProspectId, campaignId);
  }

  /**
   * Update blog lead status
   */
  static updateStatus(blogLeadId, status) {
    const stmt = db.prepare(`
      UPDATE blog_leads
      SET status = ?
      WHERE id = ?
    `);
    return stmt.run(status, blogLeadId);
  }

  /**
   * Update blog lead status by prospect ID
   */
  static updateStatusByProspect(blogProspectId, status) {
    const stmt = db.prepare(`
      UPDATE blog_leads
      SET status = ?
      WHERE blog_prospect_id = ?
    `);
    return stmt.run(status, blogProspectId);
  }

  /**
   * Get blog leads by status
   */
  static getByStatus(status, limit = 100) {
    const stmt = db.prepare(`
      SELECT bl.*, bp.domain, bp.blog_name, bp.website_url,
             c.name as campaign_name, b.name as brand_name
      FROM blog_leads bl
      JOIN blog_prospects bp ON bl.blog_prospect_id = bp.id
      JOIN campaigns c ON bl.campaign_id = c.id
      JOIN brands b ON c.brand_id = b.id
      WHERE bl.status = ?
      ORDER BY bl.found_at DESC
      LIMIT ?
    `);
    return stmt.all(status, limit);
  }

  /**
   * Get all blog leads for a campaign
   */
  static getByCampaign(campaignId) {
    const stmt = db.prepare(`
      SELECT bl.*, bp.domain, bp.blog_name, bp.website_url,
             COUNT(DISTINCT be.id) as email_count
      FROM blog_leads bl
      JOIN blog_prospects bp ON bl.blog_prospect_id = bp.id
      LEFT JOIN blog_emails be ON bp.id = be.blog_prospect_id
      WHERE bl.campaign_id = ?
      GROUP BY bl.id
      ORDER BY bl.found_at DESC
    `);
    return stmt.all(campaignId);
  }

  /**
   * Get blog leads with filters
   */
  static getAll(filters = {}) {
    let query = `
      SELECT bl.*, bp.domain, bp.blog_name, bp.website_url,
             COUNT(DISTINCT be.id) as email_count,
             c.name as campaign_name, b.name as brand_name
      FROM blog_leads bl
      JOIN blog_prospects bp ON bl.blog_prospect_id = bp.id
      LEFT JOIN blog_emails be ON bp.id = be.blog_prospect_id
      JOIN campaigns c ON bl.campaign_id = c.id
      JOIN brands b ON c.brand_id = b.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.campaign) {
      query += ' AND bl.campaign_id = ?';
      params.push(filters.campaign);
    }

    if (filters.status) {
      query += ' AND bl.status = ?';
      params.push(filters.status);
    }

    if (filters.search) {
      query += ' AND (bp.blog_name LIKE ? OR bp.domain LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    query += ' GROUP BY bl.id ORDER BY bl.found_at DESC LIMIT 500';

    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Get blog lead by ID
   */
  static getById(id) {
    const stmt = db.prepare(`
      SELECT bl.*, bp.domain, bp.blog_name, bp.website_url,
             c.name as campaign_name, b.name as brand_name
      FROM blog_leads bl
      JOIN blog_prospects bp ON bl.blog_prospect_id = bp.id
      JOIN campaigns c ON bl.campaign_id = c.id
      JOIN brands b ON c.brand_id = b.id
      WHERE bl.id = ?
    `);
    return stmt.get(id);
  }

  /**
   * Delete blog lead
   */
  static delete(id) {
    const stmt = db.prepare('DELETE FROM blog_leads WHERE id = ?');
    return stmt.run(id);
  }
}
