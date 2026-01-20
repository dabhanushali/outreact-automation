import { db } from "../database/db.js";

class EmailQueueRepo {
  /**
   * Get pending emails from queue
   */
  static getPendingEmails(limit = 50) {
    return db
      .prepare(
        `
      SELECT
        eq.*,
        COALESCE(l.campaign_id, bl.campaign_id) as campaign_id,
        COALESCE(bp.blog_name, bp.domain) as company_name,
        COALESCE(bp.domain, p.domain) as domain,
        COALESCE(c.name, 'General Outreach') as campaign_name,
        COALESCE(c.target_url, '') as target_url,
        b.name as brand_name,
        b.smtp_host,
        b.smtp_port,
        b.smtp_secure,
        b.smtp_user,
        b.smtp_password,
        b.smtp_from_name,
        b.smtp_from_email,
        et.email_category as template_category,
        et.sequence_number as template_sequence
      FROM email_queue eq
      LEFT JOIN leads l ON eq.lead_id = l.id
      LEFT JOIN prospects p ON l.prospect_id = p.id
      LEFT JOIN blog_leads bl ON eq.blog_lead_id = bl.id
      LEFT JOIN blog_prospects bp ON bl.blog_prospect_id = bp.id
      LEFT JOIN campaigns c ON (l.campaign_id = c.id OR bl.campaign_id = c.id)
      LEFT JOIN brands b ON eq.brand_id = b.id
      LEFT JOIN email_templates et ON eq.template_id = et.id
      WHERE eq.status = 'pending' AND eq.scheduled_for <= datetime('now')
      ORDER BY eq.created_at ASC
      LIMIT ?
    `
      )
      .all(limit);
  }

  /**
   * Get queue by ID
   */
  static getById(id) {
    return db.prepare("SELECT * FROM email_queue WHERE id = ?").get(id);
  }

  /**
   * Add email to queue
   */
  static addToQueue(data) {
    const stmt = db.prepare(`
      INSERT INTO email_queue (
        brand_id, lead_id, blog_lead_id, email_id, blog_email_id, template_id, to_email, subject, body,
        email_category, sequence_number, parent_log_id, scheduled_for, scheduled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime(?), datetime(?))
    `);
    return stmt.run(
      data.brand_id || null,
      data.lead_id || null,
      data.blog_lead_id || null,
      data.email_id || null,
      data.blog_email_id || null,
      data.template_id,
      data.to_email,
      data.subject,
      data.body,
      data.email_category || 'main',
      data.sequence_number || 0,
      data.parent_log_id || null,
      data.scheduled_for || "now",
      data.scheduled_at || "now"
    );
  }

  /**
   * Mark email as sending
   */
  static markAsSending(id) {
    return db
      .prepare(
        `
      UPDATE email_queue
      SET status = 'sending', attempts = attempts + 1
      WHERE id = ?
    `
      )
      .run(id);
  }

  /**
   * Mark email as sent
   */
  static markAsSent(id, messageId = null) {
    return db
      .prepare(
        `
      UPDATE email_queue
      SET status = 'sent', sent_at = datetime('now'), message_id = ?
      WHERE id = ?
    `
      )
      .run(messageId, id);
  }

  /**
   * Mark email as failed
   */
  static markAsFailed(id, errorMessage) {
    return db
      .prepare(
        `
      UPDATE email_queue
      SET status = 'failed', error_message = ?, attempts = attempts + 1
      WHERE id = ?
    `
      )
      .run(errorMessage, id);
  }

  /**
   * Count emails sent today
   */
  static countSentToday() {
    const result = db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM email_queue
      WHERE status = 'sent'
        AND date(sent_at) = date('now')
    `
      )
      .get();
    return result.count;
  }

  /**
   * Get queue statistics
   */
  static getQueueStats() {
    const pending = db
      .prepare(
        "SELECT COUNT(*) as count FROM email_queue WHERE status = 'pending'"
      )
      .get().count;
    const sending = db
      .prepare(
        "SELECT COUNT(*) as count FROM email_queue WHERE status = 'sending'"
      )
      .get().count;
    const sentToday = this.countSentToday();
    const failed = db
      .prepare(
        "SELECT COUNT(*) as count FROM email_queue WHERE status = 'failed' AND date(created_at) = date('now')"
      )
      .get().count;

    return { pending, sending, sentToday, failed };
  }

  /**
   * Get all queued emails with filters
   */
  static getAll(status = null, limit = 100) {
    let query = `
      SELECT 
        eq.*, 
        COALESCE(l.campaign_id, bl.campaign_id) as campaign_id,
        COALESCE(p.company_name, bp.blog_name) as company_name,
        COALESCE(p.domain, bp.domain) as domain,
        c.name as campaign_name
      FROM email_queue eq
      LEFT JOIN leads l ON eq.lead_id = l.id
      LEFT JOIN prospects p ON l.prospect_id = p.id
      LEFT JOIN blog_leads bl ON eq.blog_lead_id = bl.id
      LEFT JOIN blog_prospects bp ON bl.blog_prospect_id = bp.id
      LEFT JOIN campaigns c ON (l.campaign_id = c.id OR bl.campaign_id = c.id)
    `;

    const params = [];
    if (status) {
      query += " WHERE eq.status = ?";
      params.push(status);
    }

    query += " ORDER BY eq.created_at DESC LIMIT ?";
    params.push(limit);

    return db.prepare(query).all(...params);
  }

  /**
   * Get emails by lead ID
   */
  static getEmailsByLead(leadId) {
    return db
      .prepare(
        `
      SELECT eq.*, et.name as template_name
      FROM email_queue eq
      LEFT JOIN email_templates et ON eq.template_id = et.id
      WHERE eq.lead_id = ?
      ORDER BY eq.created_at DESC
    `
      )
      .all(leadId);
  }

  /**
   * Clear pending queue
   */
  static clearPending() {
    return db.prepare("DELETE FROM email_queue WHERE status = 'pending'").run();
  }

  /**
   * Delete queue item by ID
   */
  static deleteById(id) {
    return db.prepare("DELETE FROM email_queue WHERE id = ?").run(id);
  }
}

export default EmailQueueRepo;
