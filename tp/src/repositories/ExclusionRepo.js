import { db } from "../database/db.js";

/**
 * Exclusion Repository
 * Manages domain and email exclusions to avoid re-processing contacted companies
 */
export class ExclusionRepo {
  /**
   * Check if a domain is excluded
   * @param {string} domain - Domain to check
   * @returns {boolean} - True if excluded
   */
  static isDomainExcluded(domain) {
    if (!domain) return false;

    // Normalize domain (remove www., lowercase)
    const normalized = domain.toLowerCase().replace(/^www\./, '');

    const result = db.prepare(`
      SELECT COUNT(*) as count
      FROM exclusions
      WHERE type = 'domain'
      AND (
        value = ?
        OR value = ?
        OR value = ?
      )
    `).get(normalized, `www.${normalized}`, `*.${normalized}`);

    return result.count > 0;
  }

  /**
   * Check if an email is excluded
   * @param {string} email - Email to check
   * @returns {boolean} - True if excluded
   */
  static isEmailExcluded(email) {
    if (!email || !email.includes('@')) return false;

    const normalized = email.toLowerCase().trim();

    const result = db.prepare(`
      SELECT COUNT(*) as count
      FROM exclusions
      WHERE type = 'email'
      AND value = ?
    `).get(normalized);

    return result.count > 0;
  }

  /**
   * Check if a domain or any email from that domain is excluded
   * @param {string} domain - Domain to check
   * @returns {boolean} - True if excluded
   */
  static isExcluded(domain) {
    if (this.isDomainExcluded(domain)) {
      return true;
    }

    // Also check if any email from this domain is excluded
    const normalized = domain.toLowerCase().replace(/^www\./, '');

    const result = db.prepare(`
      SELECT COUNT(*) as count
      FROM exclusions
      WHERE type = 'email'
      AND value LIKE ?
    `).get(`%@${normalized}`);

    return result.count > 0;
  }

  /**
   * Get reason for exclusion
   * @param {string} value - Domain or email value
   * @returns {Object|null} - Exclusion record or null
   */
  static getExclusionReason(value) {
    const normalized = value.toLowerCase().trim();

    return db.prepare(`
      SELECT * FROM exclusions
      WHERE value = ?
      LIMIT 1
    `).get(normalized);
  }

  /**
   * Add a domain to exclusions
   * @param {string} domain - Domain to exclude
   * @param {string} reason - Reason for exclusion
   */
  static excludeDomain(domain, reason = 'Manually excluded') {
    const normalized = domain.toLowerCase().replace(/^www\./, '');

    db.prepare(`
      INSERT OR IGNORE INTO exclusions (type, value, reason)
      VALUES ('domain', ?, ?)
    `).run(normalized, reason);
  }

  /**
   * Add an email to exclusions
   * @param {string} email - Email to exclude
   * @param {string} reason - Reason for exclusion
   */
  static excludeEmail(email, reason = 'Manually excluded') {
    const normalized = email.toLowerCase().trim();

    db.prepare(`
      INSERT OR IGNORE INTO exclusions (type, value, reason)
      VALUES ('email', ?, ?)
    `).run(normalized, reason);
  }

  /**
   * Get all exclusions
   * @param {string} type - Optional filter by type ('domain' or 'email')
   * @returns {Array} - List of exclusions
   */
  static getAll(type = null) {
    if (type) {
      return db.prepare(`
        SELECT * FROM exclusions
        WHERE type = ?
        ORDER BY added_at DESC
      `).all(type);
    }

    return db.prepare(`
      SELECT * FROM exclusions
      ORDER BY type, added_at DESC
    `).all();
  }

  /**
   * Get exclusion statistics
   * @returns {Object} - Statistics
   */
  static getStats() {
    const domainCount = db.prepare('SELECT COUNT(*) as count FROM exclusions WHERE type = "domain"').get().count;
    const emailCount = db.prepare('SELECT COUNT(*) as count FROM exclusions WHERE type = "email"').get().count;

    return {
      domainCount,
      emailCount,
      total: domainCount + emailCount
    };
  }
}
