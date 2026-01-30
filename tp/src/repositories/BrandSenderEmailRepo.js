import { db } from "../database/db.js";

/**
 * Repository for managing multiple sender emails per brand
 */
class BrandSenderEmailRepo {
  /**
   * Get all sender emails for a brand
   */
  getByBrand(brandId) {
    return db
      .prepare(
        `SELECT * FROM brand_sender_emails
         WHERE brand_id = ? AND is_active = 1
         ORDER BY created_at`
      )
      .all(brandId);
  }

  /**
   * Get a random active sender email for a brand
   * Used when sending main outreach emails
   */
  getRandomSender(brandId) {
    return db
      .prepare(
        `SELECT * FROM brand_sender_emails
         WHERE brand_id = ? AND is_active = 1
         ORDER BY RANDOM()
         LIMIT 1`
      )
      .get(brandId);
  }

  /**
   * Get sender email by address
   */
  getByEmail(brandId, email) {
    return db
      .prepare(
        `SELECT * FROM brand_sender_emails
         WHERE brand_id = ? AND email = ?`
      )
      .get(brandId, email);
  }

  /**
   * Get today's sent count for a specific sender email
   * Used for daily limit enforcement
   */
  getTodaySentCount(senderEmail) {
    const today = new Date().toISOString().split("T")[0];
    const result = db
      .prepare(
        `SELECT COUNT(*) as count FROM outreach_logs
         WHERE sender_email = ?
         AND DATE(sent_at) = ?`
      )
      .get(senderEmail, today);
    return result?.count || 0;
  }

  /**
   * Get all sender emails with today's usage stats
   */
  getAllWithStats(brandId) {
    const today = new Date().toISOString().split("T")[0];
    return db
      .prepare(
        `SELECT
          bse.*,
          COUNT(DISTINCT ol.id) as today_sent
         FROM brand_sender_emails bse
         LEFT JOIN outreach_logs ol
           ON bse.email = ol.sender_email
           AND DATE(ol.sent_at) = ?
         WHERE bse.brand_id = ?
         GROUP BY bse.id
         ORDER BY bse.created_at`
      )
      .all(today, brandId);
  }

  /**
   * Create a new sender email for a brand
   */
  create({ brand_id, email, from_name, daily_limit = 20, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password }) {
    const stmt = db.prepare(`
      INSERT INTO brand_sender_emails (
        brand_id, email, from_name, daily_limit,
        smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      brand_id, email, from_name, daily_limit,
      smtp_host || null, smtp_port || 587, smtp_secure === "true" || smtp_secure === true ? 1 : 0,
      smtp_user || null, smtp_password || null
    );
  }

  /**
   * Update sender email
   */
  update(id, { email, from_name, is_active, daily_limit, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password }) {
    const updates = [];
    const values = [];

    if (email !== undefined && email !== '') {
      updates.push("email = ?");
      values.push(email);
    }
    if (from_name !== undefined) {
      updates.push("from_name = ?");
      values.push(from_name || null);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(is_active === "true" || is_active === true || is_active === 1 ? 1 : 0);
    }
    if (daily_limit !== undefined && daily_limit !== '') {
      updates.push("daily_limit = ?");
      values.push(daily_limit ? parseInt(daily_limit) : null);
    }
    // SMTP fields - only update if provided and not empty
    if (smtp_host !== undefined && smtp_host !== '') {
      updates.push("smtp_host = ?");
      values.push(smtp_host);
    }
    if (smtp_port !== undefined && smtp_port !== '') {
      updates.push("smtp_port = ?");
      values.push(smtp_port ? parseInt(smtp_port) : null);
    }
    if (smtp_secure !== undefined && smtp_secure !== '') {
      updates.push("smtp_secure = ?");
      values.push(smtp_secure === "true" || smtp_secure === true || smtp_secure === 1 ? 1 : 0);
    }
    if (smtp_user !== undefined && smtp_user !== '') {
      updates.push("smtp_user = ?");
      values.push(smtp_user);
    }
    if (smtp_password !== undefined && smtp_password !== '') {
      updates.push("smtp_password = ?");
      values.push(smtp_password);
    }

    if (updates.length === 0) return;

    values.push(id);
    const stmt = db.prepare(`
      UPDATE brand_sender_emails
      SET ${updates.join(", ")}
      WHERE id = ?
    `);
    return stmt.run(...values);
  }

  /**
   * Delete sender email
   */
  delete(id) {
    const stmt = db.prepare("DELETE FROM brand_sender_emails WHERE id = ?");
    return stmt.run(id);
  }

  /**
   * Get sender email by ID
   */
  getById(id) {
    return db
      .prepare("SELECT * FROM brand_sender_emails WHERE id = ?")
      .get(id);
  }
}

export default new BrandSenderEmailRepo();
