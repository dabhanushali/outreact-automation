import { db } from "../database/db.js";

/**
 * Repository for email operations
 */
export class EmailRepo {
  /**
   * Add a new email for a prospect
   * @param {number} prospectId - The prospect ID
   * @param {string} email - The email address
   * @param {string} sourcePage - URL where email was found
   * @param {boolean} isDomainMatch - Does email domain match prospect domain?
   * @param {boolean} isGeneric - Is it a generic email (info@, contact@)?
   * @param {number} confidence - Confidence score (0-100)
   * @returns {number|null} - The email ID or null if duplicate
   */
  static create(prospectId, email, sourcePage = null, isDomainMatch = true, isGeneric = false, confidence = 100) {
    const stmt = db.prepare(`
      INSERT INTO emails (prospect_id, email, source_page, is_domain_match, is_generic, confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    try {
      const info = stmt.run(prospectId, email, sourcePage, isDomainMatch ? 1 : 0, isGeneric ? 1 : 0, confidence);
      return info.lastInsertRowid;
    } catch (e) {
      if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return null; // Duplicate email
      }
      throw e;
    }
  }

  /**
   * Get all emails for a prospect
   * @param {number} prospectId - The prospect ID
   * @returns {Array} - Array of email records
   */
  static findByProspect(prospectId) {
    const stmt = db.prepare("SELECT * FROM emails WHERE prospect_id = ? ORDER BY confidence DESC");
    return stmt.all(prospectId);
  }

  /**
   * Get the best email for a prospect (domain-matched, non-generic first)
   * @param {number} prospectId - The prospect ID
   * @returns {Object|null} - The best email record or null
   */
  static getBestEmail(prospectId) {
    const stmt = db.prepare(`
      SELECT * FROM emails
      WHERE prospect_id = ?
      ORDER BY
        is_domain_match DESC,
        is_generic ASC,
        confidence DESC
      LIMIT 1
    `);
    return stmt.get(prospectId);
  }

  /**
   * Check if an email already exists
   * @param {string} email - The email address
   * @returns {boolean} - True if email exists
   */
  static exists(email) {
    const stmt = db.prepare("SELECT 1 FROM emails WHERE email = ? LIMIT 1");
    return stmt.get(email) !== undefined;
  }

  /**
   * Count emails found today
   * @returns {number} - Count of emails found today
   */
  static countToday() {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM emails
      WHERE DATE(created_at) = DATE('now')
    `);
    const result = stmt.get();
    return result.count;
  }
}
