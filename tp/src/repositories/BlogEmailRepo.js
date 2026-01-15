import { db } from "../database/db.js";

/**
 * Repository for blog email operations
 */
export class BlogEmailRepo {
  /**
   * Add a new email for a blog prospect
   * @param {number} blogProspectId - The blog prospect ID
   * @param {string} email - The email address
   * @param {string} sourcePage - URL where email was found
   * @param {boolean} isDomainMatch - Does email domain match prospect domain?
   * @param {boolean} isGeneric - Is it a generic email (info@, contact@)?
   * @param {number} confidence - Confidence score (0-100)
   * @returns {number|null} - The email ID or null if duplicate
   */
  static create(blogProspectId, email, sourcePage = null, isDomainMatch = true, isGeneric = false, confidence = 100) {
    const stmt = db.prepare(`
      INSERT INTO blog_emails (blog_prospect_id, email, source_page, is_domain_match, is_generic, confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    try {
      const info = stmt.run(blogProspectId, email, sourcePage, isDomainMatch ? 1 : 0, isGeneric ? 1 : 0, confidence);
      return info.lastInsertRowid;
    } catch (e) {
      if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return null; // Duplicate email
      }
      throw e;
    }
  }

  /**
   * Get all emails for a blog prospect
   * @param {number} blogProspectId - The blog prospect ID
   * @returns {Array} - Array of email records
   */
  static findByProspect(blogProspectId) {
    const stmt = db.prepare("SELECT * FROM blog_emails WHERE blog_prospect_id = ? ORDER BY confidence DESC");
    return stmt.all(blogProspectId);
  }

  /**
   * Get the best email for a blog prospect (domain-matched, non-generic first)
   * @param {number} blogProspectId - The blog prospect ID
   * @returns {Object|null} - The best email record or null
   */
  static getBestEmail(blogProspectId) {
    const stmt = db.prepare(`
      SELECT * FROM blog_emails
      WHERE blog_prospect_id = ?
      ORDER BY
        is_domain_match DESC,
        is_generic ASC,
        confidence DESC
      LIMIT 1
    `);
    return stmt.get(blogProspectId);
  }

  /**
   * Check if an email already exists in blog_emails
   * @param {string} email - The email address
   * @returns {boolean} - True if email exists
   */
  static exists(email) {
    const stmt = db.prepare("SELECT 1 FROM blog_emails WHERE email = ? LIMIT 1");
    return stmt.get(email) !== undefined;
  }

  /**
   * Count blog emails found today
   * @returns {number} - Count of emails found today
   */
  static countToday() {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM blog_emails
      WHERE DATE(created_at) = DATE('now')
    `);
    const result = stmt.get();
    return result.count;
  }

  /**
   * Count all blog emails
   * @returns {number} - Total count
   */
  static getTotalCount() {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM blog_emails");
    const result = stmt.get();
    return result.count;
  }
}
