import EmailQueueRepo from '../repositories/EmailQueueRepo.js';
import TemplateService from './TemplateService.js';
import { db } from '../database/db.js';

class EmailQueueService {
  /**
   * Queue single email
   */
  static queueEmail(leadId, emailId, templateId, scheduledFor = null) {
    try {
      // Prepare email with template
      const emailData = TemplateService.prepareEmail(templateId, leadId, emailId);

      // Add to queue
      const result = EmailQueueRepo.addToQueue({
        ...emailData,
        scheduled_for: scheduledFor,
      });

      return { success: true, queueId: result.lastInsertRowid };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Queue multiple leads with template
   */
  static queueBulk(leadEmailPairs, templateId, scheduledFor = null) {
    const results = [];
    const errors = [];

    for (const pair of leadEmailPairs) {
      try {
        const result = this.queueEmail(pair.lead_id, pair.email_id, templateId, scheduledFor);
        if (result.success) {
          results.push(result);
        } else {
          errors.push({ pair, error: result.error });
        }
      } catch (error) {
        errors.push({ pair, error: error.message });
      }
    }

    return { queued: results.length, failed: errors.length, errors };
  }

  /**
   * Queue all READY blog leads for a campaign
   */
  static queueCampaignLeads(campaignId, templateId, limit = null) {
    let query = `
      SELECT bl.id as lead_id, be.id as email_id
      FROM blog_leads bl
      JOIN blog_prospects bp ON bl.blog_prospect_id = bp.id
      JOIN blog_emails be ON bp.id = be.blog_prospect_id
      WHERE bl.campaign_id = ?
        AND bl.status = 'READY'
        AND be.is_domain_match = 1
        AND be.is_generic = 0
      ORDER BY bl.found_at ASC
    `;

    if (limit) {
      query += ' LIMIT ?';
    }

    const leads = db.prepare(query).all(campaignId, limit || undefined);

    if (leads.length === 0) {
      return { queued: 0, message: 'No READY blog leads found with domain-matched, non-generic emails' };
    }

    return this.queueBulk(leads, templateId);
  }

  /**
   * Get queue statistics
   */
  static getQueueStats() {
    return EmailQueueRepo.getQueueStats();
  }

  /**
   * Get all queued emails
   */
  static getAllQueued(status = null, limit = 100) {
    return EmailQueueRepo.getAll(status, limit);
  }

  /**
   * Get queued emails by lead
   */
  static getEmailsByLead(leadId) {
    return EmailQueueRepo.getEmailsByLead(leadId);
  }

  /**
   * Clear pending queue
   */
  static clearQueue() {
    const result = EmailQueueRepo.clearPending();
    return { cleared: result.changes };
  }

  /**
   * Delete specific queue item
   */
  static deleteQueueItem(id) {
    return EmailQueueRepo.deleteById(id);
  }

  /**
   * Get blog leads ready for queuing
   */
  static getReadyLeads(campaignId = null, limit = 50) {
    let query = `
      SELECT
        bl.id as lead_id,
        bl.campaign_id,
        bl.blog_prospect_id,
        bp.blog_name,
        bp.domain,
        COUNT(DISTINCT be.id) as email_count,
        c.name as campaign_name
      FROM blog_leads bl
      JOIN blog_prospects bp ON bl.blog_prospect_id = bp.id
      JOIN blog_emails be ON bp.id = be.blog_prospect_id
      JOIN campaigns c ON bl.campaign_id = c.id
      WHERE bl.status = 'READY'
        AND be.is_domain_match = 1
        AND be.is_generic = 0
    `;

    const params = [];

    if (campaignId) {
      query += ' AND bl.campaign_id = ?';
      params.push(campaignId);
    }

    query += `
      GROUP BY bl.id
      ORDER BY bl.found_at ASC
      LIMIT ?
    `;
    params.push(limit);

    return db.prepare(query).all(...params);
  }

  /**
   * Queue selected leads
   */
  static queueSelectedLeads(leadIds, emailIds, templateId) {
    const pairs = [];

    for (let i = 0; i < leadIds.length; i++) {
      pairs.push({
        lead_id: leadIds[i],
        email_id: emailIds[i],
      });
    }

    return this.queueBulk(pairs, templateId);
  }
}

export default EmailQueueService;
