import { db } from '../database/db.js';

class EmailQueueRepo {
  /**
   * Get pending emails from queue
   */
  static getPendingEmails(limit = 50) {
    return db.prepare(`
      SELECT eq.*, l.campaign_id, l.prospect_id,
             p.company_name, p.domain, p.city, p.country,
             c.name as campaign_name, b.name as brand_name
      FROM email_queue eq
      JOIN leads l ON eq.lead_id = l.id
      JOIN prospects p ON l.prospect_id = p.id
      JOIN campaigns c ON l.campaign_id = c.id
      JOIN brands b ON c.brand_id = b.id
      WHERE eq.status = 'pending'
        AND eq.scheduled_for <= datetime('now')
      ORDER BY eq.created_at ASC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get queue by ID
   */
  static getById(id) {
    return db.prepare('SELECT * FROM email_queue WHERE id = ?').get(id);
  }

  /**
   * Add email to queue
   */
  static addToQueue(data) {
    const stmt = db.prepare(`
      INSERT INTO email_queue (
        lead_id, email_id, template_id, to_email, subject, body, scheduled_for
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.lead_id,
      data.email_id,
      data.template_id,
      data.to_email,
      data.subject,
      data.body,
      data.scheduled_for || new Date().toISOString()
    );
  }

  /**
   * Mark email as sending
   */
  static markAsSending(id) {
    return db.prepare(`
      UPDATE email_queue
      SET status = 'sending', attempts = attempts + 1
      WHERE id = ?
    `).run(id);
  }

  /**
   * Mark email as sent
   */
  static markAsSent(id, messageId = null) {
    return db.prepare(`
      UPDATE email_queue
      SET status = 'sent', sent_at = datetime('now'), message_id = ?
      WHERE id = ?
    `).run(messageId, id);
  }

  /**
   * Mark email as failed
   */
  static markAsFailed(id, errorMessage) {
    return db.prepare(`
      UPDATE email_queue
      SET status = 'failed', error_message = ?, attempts = attempts + 1
      WHERE id = ?
    `).run(errorMessage, id);
  }

  /**
   * Count emails sent today
   */
  static countSentToday() {
    const result = db.prepare(`
      SELECT COUNT(*) as count
      FROM email_queue
      WHERE status = 'sent'
        AND date(sent_at) = date('now')
    `).get();
    return result.count;
  }

  /**
   * Get queue statistics
   */
  static getQueueStats() {
    const pending = db.prepare("SELECT COUNT(*) as count FROM email_queue WHERE status = 'pending'").get().count;
    const sending = db.prepare("SELECT COUNT(*) as count FROM email_queue WHERE status = 'sending'").get().count;
    const sentToday = this.countSentToday();
    const failed = db.prepare("SELECT COUNT(*) as count FROM email_queue WHERE status = 'failed' AND date(created_at) = date('now')").get().count;

    return { pending, sending, sentToday, failed };
  }

  /**
   * Get all queued emails with filters
   */
  static getAll(status = null, limit = 100) {
    let query = `
      SELECT eq.*, l.campaign_id,
             p.company_name, p.domain,
             c.name as campaign_name
      FROM email_queue eq
      JOIN leads l ON eq.lead_id = l.id
      JOIN prospects p ON l.prospect_id = p.id
      JOIN campaigns c ON l.campaign_id = c.id
    `;

    const params = [];
    if (status) {
      query += ' WHERE eq.status = ?';
      params.push(status);
    }

    query += ' ORDER BY eq.created_at DESC LIMIT ?';
    params.push(limit);

    return db.prepare(query).all(...params);
  }

  /**
   * Get emails by lead ID
   */
  static getEmailsByLead(leadId) {
    return db.prepare(`
      SELECT eq.*, et.name as template_name
      FROM email_queue eq
      LEFT JOIN email_templates et ON eq.template_id = et.id
      WHERE eq.lead_id = ?
      ORDER BY eq.created_at DESC
    `).all(leadId);
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
    return db.prepare('DELETE FROM email_queue WHERE id = ?').run(id);
  }
}

export default EmailQueueRepo;
