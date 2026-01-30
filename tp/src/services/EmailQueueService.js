import EmailQueueRepo from '../repositories/EmailQueueRepo.js';
import TemplateService from './TemplateService.js';
import BrandSenderEmailRepo from '../repositories/BrandSenderEmailRepo.js';
import { db } from '../database/db.js';
import fs from 'fs';
import path from 'path';

class EmailQueueService {
  /**
   * Get the path to the round-robin tracker file
   */
  static getTrackerFilePath() {
    return path.join(process.cwd(), 'sender-rotation-tracker.json');
  }

  /**
   * Get current rotation index from tracker file
   */
  static getRotationIndex() {
    try {
      const trackerPath = this.getTrackerFilePath();
      if (fs.existsSync(trackerPath)) {
        const data = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
        return data.index || 0;
      }
    } catch (error) {
      console.error('Error reading rotation tracker:', error.message);
    }
    return 0;
  }

  /**
   * Save rotation index to tracker file
   */
  static saveRotationIndex(index) {
    try {
      const trackerPath = this.getTrackerFilePath();
      fs.writeFileSync(trackerPath, JSON.stringify({ index }, null, 2));
    } catch (error) {
      console.error('Error saving rotation tracker:', error.message);
    }
  }

  /**
   * Get all active sender emails across all brands (with SMTP configured)
   */
  static getAllActiveSenders() {
    const query = `
      SELECT bse.id, bse.email, bse.from_name, bse.brand_id, b.name as brand_name,
             bse.smtp_host, bse.smtp_port, bse.smtp_secure, bse.smtp_user, bse.smtp_password,
             bse.daily_limit
      FROM brand_sender_emails bse
      JOIN brands b ON bse.brand_id = b.id
      WHERE bse.is_active = 1
        AND bse.smtp_host IS NOT NULL
        AND bse.smtp_host != ''
      ORDER BY bse.id ASC
    `;
    return db.prepare(query).all();
  }

  /**
   * Get next sender using global round-robin across all brands
   * Follow-ups still use parent's sender for consistency
   */
  static getSenderEmail(brandId, emailCategory, parentLogId = null) {
    // For follow-ups, get sender from parent log
    if (emailCategory.startsWith('followup_') && parentLogId) {
      const parentLog = db.prepare(
        'SELECT sender_email FROM outreach_logs WHERE id = ?'
      ).get(parentLogId);

      if (parentLog?.sender_email) {
        return parentLog.sender_email;
      }
    }

    // For main emails, use global round-robin across all brands
    const allSenders = this.getAllActiveSenders();

    if (allSenders.length === 0) {
      throw new Error('No active sender emails with SMTP configuration found. Please add and configure sender emails in Brand Settings.');
    }

    // Get current index and select sender
    const currentIndex = this.getRotationIndex();
    const selectedSender = allSenders[currentIndex];

    // Calculate next index (wrap around)
    const nextIndex = (currentIndex + 1) % allSenders.length;
    this.saveRotationIndex(nextIndex);

    console.log(`🔄 Round-robin sender: ${selectedSender.email} (Brand: ${selectedSender.brand_name}, Index: ${currentIndex + 1}/${allSenders.length})`);

    return selectedSender.email;
  }

  /**
   * Queue single email
   */
  static queueEmail(leadId, emailId, templateId, brandId, scheduledFor = null, parentLogId = null) {
    try {
      // Get template to check email_category
      const template = db.prepare(
        'SELECT email_category FROM email_templates WHERE id = ?'
      ).get(templateId);

      const emailCategory = template?.email_category || 'main';

      // Select sender email based on category
      const senderEmail = this.getSenderEmail(brandId, emailCategory, parentLogId);

      // Prepare email with template
      const emailData = TemplateService.prepareEmail(templateId, leadId, emailId);

      // Add to queue with sender_email
      const result = EmailQueueRepo.addToQueue({
        brand_id: brandId,
        sender_email: senderEmail,
        parent_log_id: parentLogId,
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
  static queueBulk(leadEmailPairs, templateId, brandId = null, scheduledFor = null) {
    const results = [];
    const errors = [];

    for (const pair of leadEmailPairs) {
      try {
        const result = this.queueEmail(pair.lead_id, pair.email_id, templateId, brandId, scheduledFor);
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
    // Get brand_id from campaign
    const campaign = db.prepare('SELECT brand_id FROM campaigns WHERE id = ?').get(campaignId);

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

    return this.queueBulk(leads, templateId, campaign?.brand_id || null);
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
  static queueSelectedLeads(leadIds, emailIds, templateId, brandId) {
    const pairs = [];

    for (let i = 0; i < leadIds.length; i++) {
      pairs.push({
        lead_id: leadIds[i],
        email_id: emailIds[i],
      });
    }

    return this.queueBulk(pairs, templateId, brandId);
  }
}

export default EmailQueueService;
