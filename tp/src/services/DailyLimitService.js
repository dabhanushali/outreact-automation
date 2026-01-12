import { db } from "../database/db.js";

/**
 * Daily Limit Service
 * Tracks and enforces daily limits for prospect/email collection
 */
export class DailyLimitService {
  static DAILY_LIMIT = 100; // Target: 100 companies per day

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
      "INSERT OR IGNORE INTO daily_limits (date, prospects_added, emails_found, outreach_sent) VALUES (?, 0, 0, 0)"
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
   * Check if daily limit reached
   * @returns {boolean} - True if limit reached
   */
  static isLimitReached() {
    const stats = this.getTodayStats();
    return stats.prospects_added >= this.DAILY_LIMIT;
  }

  /**
   * Get remaining count for today
   * @returns {number} - Remaining prospects that can be added
   */
  static getRemaining() {
    const stats = this.getTodayStats();
    return Math.max(0, this.DAILY_LIMIT - stats.prospects_added);
  }

  /**
   * Get progress percentage
   * @returns {number} - Progress (0-100)
   */
  static getProgress() {
    const stats = this.getTodayStats();
    return Math.min(100, Math.round((stats.prospects_added / this.DAILY_LIMIT) * 100));
  }

  /**
   * Print stats summary
   */
  static printStats() {
    const stats = this.getTodayStats();
    const remaining = this.getRemaining();
    const progress = this.getProgress();

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`           DAILY LIMIT STATS (${stats.date})          `);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Prospects Added:    ${stats.prospects_added}/${this.DAILY_LIMIT}`);
    console.log(`  Emails Found:       ${stats.emails_found}`);
    console.log(`  Progress:           ${progress}%`);
    console.log(`  Remaining:          ${remaining}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  }

  /**
   * Reset today's stats (for testing/debugging)
   */
  static resetToday() {
    const today = this.getToday();
    this.ensureTodayRecord();
    const stmt = db.prepare(
      "UPDATE daily_limits SET prospects_added = 0, emails_found = 0, outreach_sent = 0 WHERE date = ?"
    );
    stmt.run(today);
    console.log(`Reset stats for ${today}`);
  }
}
