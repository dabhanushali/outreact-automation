import { db } from "../database/db.js";

/**
 * Daily Limit Service
 * Tracks and enforces daily limits for prospect/email/blog asset collection
 */
export class DailyLimitService {
  static DAILY_PROSPECT_LIMIT = 10; // Target: 100 companies per day
  static DAILY_BLOG_LIMIT = 10; // Target: 100 blog assets per day (same as prospects)

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

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`           DAILY LIMIT STATS (${stats.date})          `);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(
      `  Prospects Added:    ${stats.prospects_added}/${this.DAILY_PROSPECT_LIMIT}`
    );
    console.log(`  Emails Found:       ${stats.emails_found}`);
    console.log(
      `  Blog Assets Found:  ${stats.blog_assets_found}/${this.DAILY_BLOG_LIMIT}`
    );
    console.log(
      `  Progress:           ${progress}% (prospects), ${blogProgress}% (blogs)`
    );
    console.log(
      `  Remaining:          ${remaining} prospects, ${blogRemaining} blogs`
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
}
