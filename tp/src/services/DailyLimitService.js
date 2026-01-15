import { db } from "../database/db.js";

/**
 * Daily Limit Service
 * Tracks and enforces daily limits for prospect/email/blog asset collection
 */
export class DailyLimitService {
  /**
   * Get a setting value from database
   * @param {string} key - Setting key
   * @param {number} defaultValue - Default value if not found
   * @returns {number} - Setting value
   */
  static getSetting(key, defaultValue = 10) {
    try {
      const result = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
      return result ? parseInt(result.value) : defaultValue;
    } catch (error) {
      console.error(`Error getting setting ${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * Set a setting value in database
   * @param {string} key - Setting key
   * @param {number} value - Setting value
   */
  static setSetting(key, value) {
    try {
      db.prepare(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `).run(key, value.toString());
    } catch (error) {
      console.error(`Error setting ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get daily prospect limit (from database)
   * @returns {number} - Daily prospect limit
   */
  static get DAILY_PROSPECT_LIMIT() {
    return this.getSetting('daily_prospect_limit', 10);
  }

  /**
   * Get daily blog limit (from database)
   * @returns {number} - Daily blog limit
   */
  static get DAILY_BLOG_LIMIT() {
    return this.getSetting('daily_blog_limit', 10);
  }

  /**
   * Get daily email limit (from database)
   * @returns {number} - Daily email limit
   */
  static get DAILY_EMAIL_LIMIT() {
    return this.getSetting('daily_email_limit', 50);
  }

  /**
   * Get daily outreach limit (from database)
   * @returns {number} - Daily outreach limit
   */
  static get DAILY_OUTREACH_LIMIT() {
    return this.getSetting('daily_outreach_limit', 20);
  }

  /**
   * Get today's date string
   * @returns {string} - Today's date in YYYY-MM-DD format
   */
  static getToday() {
    const today = new Date().toISOString().split("T")[0];
    return today;
  }

  /**
   * Initialize today's record if not exists
   */
  static ensureTodayRecord() {
    const today = this.getToday();
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO daily_limits (date, prospects_added, emails_found, blog_assets_found, outreach_sent) VALUES (?, 0, 0, 0, 0)"
    );
    stmt.run(today);
  }

  /**
   * Get today's stats
   * @returns {Object} - {date, prospects_added, emails_found, outreach_sent}
   */
  static getTodayStats() {
    this.ensureTodayRecord();
    const today = this.getToday();
    const stmt = db.prepare("SELECT * FROM daily_limits WHERE date = ?");
    return stmt.get(today);
  }

  /**
   * Increment prospects added count
   * @returns {number} - New count
   */
  static incrementProspects() {
    this.ensureTodayRecord();
    const today = this.getToday();
    const stmt = db.prepare(
      "UPDATE daily_limits SET prospects_added = prospects_added + 1 WHERE date = ?"
    );
    stmt.run(today);
    return this.getTodayStats().prospects_added;
  }

  /**
   * Increment emails found count
   * @returns {number} - New count
   */
  static incrementEmails() {
    this.ensureTodayRecord();
    const today = this.getToday();
    const stmt = db.prepare(
      "UPDATE daily_limits SET emails_found = emails_found + 1 WHERE date = ?"
    );
    stmt.run(today);
    return this.getTodayStats().emails_found;
  }

  /**
   * Increment blog assets found count
   * @returns {number} - New count
   */
  static incrementBlogAssets() {
    this.ensureTodayRecord();
    const today = this.getToday();
    const stmt = db.prepare(
      "UPDATE daily_limits SET blog_assets_found = blog_assets_found + 1 WHERE date = ?"
    );
    stmt.run(today);
    return this.getTodayStats().blog_assets_found;
  }

  /**
   * Check if prospect daily limit reached
   * @returns {boolean} - True if limit reached
   */
  static isProspectLimitReached() {
    const stats = this.getTodayStats();
    return stats.prospects_added >= this.DAILY_PROSPECT_LIMIT;
  }

  /**
   * Check if blog asset daily limit reached
   * @returns {boolean} - True if limit reached
   */
  static isBlogLimitReached() {
    const stats = this.getTodayStats();
    return stats.blog_assets_found >= this.DAILY_BLOG_LIMIT;
  }

  /**
   * Check if email daily limit reached
   * @returns {boolean} - True if limit reached
   */
  static isEmailLimitReached() {
    const stats = this.getTodayStats();
    return stats.emails_found >= this.DAILY_EMAIL_LIMIT;
  }

  /**
   * Check if any daily limit reached (legacy method for backward compatibility)
   * @returns {boolean} - True if any limit reached
   */
  static isLimitReached() {
    return this.isProspectLimitReached() || this.isBlogLimitReached();
  }

  /**
   * Get remaining prospect count for today
   * @returns {number} - Remaining prospects that can be added
   */
  static getRemaining() {
    const stats = this.getTodayStats();
    return Math.max(0, this.DAILY_PROSPECT_LIMIT - stats.prospects_added);
  }

  /**
   * Get remaining blog asset count for today
   * @returns {number} - Remaining blog assets that can be added
   */
  static getBlogRemaining() {
    const stats = this.getTodayStats();
    return Math.max(0, this.DAILY_BLOG_LIMIT - stats.blog_assets_found);
  }

  /**
   * Get remaining email count for today
   * @returns {number} - Remaining emails that can be extracted
   */
  static getEmailRemaining() {
    const stats = this.getTodayStats();
    return Math.max(0, this.DAILY_EMAIL_LIMIT - stats.emails_found);
  }

  /**
   * Get prospect progress percentage
   * @returns {number} - Progress (0-100)
   */
  static getProgress() {
    const stats = this.getTodayStats();
    return Math.min(
      100,
      Math.round((stats.prospects_added / this.DAILY_PROSPECT_LIMIT) * 100)
    );
  }

  /**
   * Get blog asset progress percentage
   * @returns {number} - Progress (0-100)
   */
  static getBlogProgress() {
    const stats = this.getTodayStats();
    return Math.min(
      100,
      Math.round((stats.blog_assets_found / this.DAILY_BLOG_LIMIT) * 100)
    );
  }

  /**
   * Print stats summary
   */
  static printStats() {
    const stats = this.getTodayStats();
    const remaining = this.getRemaining();
    const progress = this.getProgress();
    const blogRemaining = this.getBlogRemaining();
    const blogProgress = this.getBlogProgress();
    const emailRemaining = this.getEmailRemaining();

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`           DAILY LIMIT STATS (${stats.date})          `);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(
      `  Prospects Added:    ${stats.prospects_added}/${this.DAILY_PROSPECT_LIMIT}`
    );
    console.log(`  Emails Found:       ${stats.emails_found}/${this.DAILY_EMAIL_LIMIT}`);
    console.log(
      `  Blog Assets Found:  ${stats.blog_assets_found}/${this.DAILY_BLOG_LIMIT}`
    );
    console.log(`  Outreach Sent:      ${stats.outreach_sent}/${this.DAILY_OUTREACH_LIMIT}`);
    console.log(
      `  Progress:           ${progress}% (prospects), ${blogProgress}% (blogs)`
    );
    console.log(
      `  Remaining:          ${remaining} prospects, ${blogRemaining} blogs, ${emailRemaining} emails`
    );
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  }

  /**
   * Reset today's stats (for testing/debugging)
   */
  static resetToday() {
    const today = this.getToday();
    this.ensureTodayRecord();
    const stmt = db.prepare(
      "UPDATE daily_limits SET prospects_added = 0, emails_found = 0, blog_assets_found = 0, outreach_sent = 0 WHERE date = ?"
    );
    stmt.run(today);
    console.log(`Reset stats for ${today}`);
  }

  /**
   * Get all limit settings
   * @returns {Object} - All limit settings
   */
  static getAllLimits() {
    return {
      prospect_limit: this.DAILY_PROSPECT_LIMIT,
      blog_limit: this.DAILY_BLOG_LIMIT,
      email_limit: this.DAILY_EMAIL_LIMIT,
      outreach_limit: this.DAILY_OUTREACH_LIMIT
    };
  }

  /**
   * Update limit settings
   * @param {Object} limits - Object with limit values
   */
  static updateLimits(limits) {
    if (limits.prospect_limit !== undefined) {
      this.setSetting('daily_prospect_limit', limits.prospect_limit);
    }
    if (limits.blog_limit !== undefined) {
      this.setSetting('daily_blog_limit', limits.blog_limit);
    }
    if (limits.email_limit !== undefined) {
      this.setSetting('daily_email_limit', limits.email_limit);
    }
    if (limits.outreach_limit !== undefined) {
      this.setSetting('daily_outreach_limit', limits.outreach_limit);
    }
  }

  /**
   * Get all system settings
   * @returns {Array} - All system settings
   */
  static getAllSettings() {
    return db.prepare('SELECT * FROM system_settings ORDER BY key').all();
  }
}
