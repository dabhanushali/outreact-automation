import { db } from "../database/db.js";
import EmailQueueService from "./EmailQueueService.js";
import EmailQueueRepo from "../repositories/EmailQueueRepo.js";
import TemplateService from "./TemplateService.js";

/**
 * Follow-Up Automation Service
 * Manually triggers follow-up email scheduling based on configurable intervals
 */
class FollowUpService {
  /**
   * Get follow-up schedule from database settings
   */
  static getScheduleFromDB() {
    const getSetting = (key, defaultValue) => {
      const row = db.prepare("SELECT value FROM system_settings WHERE key = ?").get(key);
      return row ? parseInt(row.value) : defaultValue;
    };

    return {
      followup_1: getSetting('followup_1_interval_days', 3),
      followup_2: getSetting('followup_2_interval_days', 7),
      followup_3: getSetting('followup_3_interval_days', 14),
      followup_4: getSetting('followup_4_interval_days', 21),
    };
  }

  /**
   * Schedule all follow-ups for a lead after main email is sent
   * @param {number} logId - The outreach_log ID of the main email
   * @param {number} leadId - The lead ID
   * @param {number} blogLeadId - The blog lead ID (optional)
   * @param {number} emailId - The email ID
   * @param {number} blogEmailId - The blog email ID (optional)
   * @param {number} brandId - The brand ID
   */
  static async scheduleFollowUps(logId, leadId, blogLeadId, emailId, blogEmailId, brandId) {
    console.log(`\n📅 Scheduling follow-up emails...`);

    // Get schedule from database settings
    const schedule = this.getScheduleFromDB();

    // Get the campaign ID from the lead
    let campaignId = null;
    if (blogLeadId) {
      const lead = db.prepare("SELECT campaign_id FROM blog_leads WHERE id = ?").get(blogLeadId);
      if (lead) campaignId = lead.campaign_id;
    } else if (leadId) {
      const lead = db.prepare("SELECT campaign_id FROM leads WHERE id = ?").get(leadId);
      if (lead) campaignId = lead.campaign_id;
    }

    if (!campaignId) {
      console.log(`  ⚠ No campaign found, skipping follow-ups`);
      return { scheduled: 0 };
    }

    // Get follow-up templates
    const templates = db.prepare(`
      SELECT id, email_category, sequence_number
      FROM email_templates
      WHERE email_category IN ('followup_1', 'followup_2', 'followup_3', 'followup_4')
        AND is_active = 1
      ORDER BY sequence_number ASC
    `).all();

    if (templates.length === 0) {
      console.log(`  ⚠ No follow-up templates found`);
      return { scheduled: 0 };
    }

    let scheduledCount = 0;

    for (const template of templates) {
      const category = template.email_category;
      const delayDays = schedule[category] || 7;

      // Calculate scheduled date
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + delayDays);

      // Format for SQLite
      const scheduledFor = scheduledDate.toISOString().replace('T', ' ').slice(0, 19);

      try {
        // Prepare email data
        const emailData = {
          blog_lead_id: blogLeadId || null,
          blog_email_id: blogEmailId || null,
          lead_id: leadId || null,
          email_id: emailId || null,
          template_id: template.id,
          to_email: '', // Will be filled by prepareEmail
          subject: '', // Will be filled by prepareEmail
          body: '', // Will be filled by prepareEmail
          email_category: category,
          sequence_number: template.sequence_number,
          parent_log_id: logId,
        };

        // Get the actual email address
        let toEmail = null;
        if (blogEmailId) {
          const email = db.prepare("SELECT email FROM blog_emails WHERE id = ?").get(blogEmailId);
          toEmail = email?.email;
        } else if (emailId) {
          const email = db.prepare("SELECT email FROM emails WHERE id = ?").get(emailId);
          toEmail = email?.email;
        }

        if (!toEmail) {
          console.log(`  ⊗ Skip ${category}: No email found`);
          continue;
        }

        // Use TemplateService to prepare the email
        const prepared = TemplateService.prepareEmail(
          template.id,
          blogLeadId || leadId,
          blogEmailId || emailId
        );

        // Add to queue
        const result = EmailQueueRepo.addToQueue({
          brand_id: brandId,
          ...prepared,
          email_category: category,
          sequence_number: template.sequence_number,
          parent_log_id: logId,
          scheduled_for: scheduledFor,
        });

        scheduledCount++;
        console.log(`  ✓ ${category} scheduled for ${scheduledFor.split(' ')[0]} (delay: ${delayDays} days)`);
      } catch (error) {
        console.error(`  ✗ Failed to schedule ${category}: ${error.message}`);
      }
    }

    console.log(`\n📊 Follow-up scheduling complete: ${scheduledCount} emails scheduled\n`);
    return { scheduled: scheduledCount };
  }

  /**
   * Check for leads that need follow-ups and schedule them
   * Run this periodically (e.g., daily)
   */
  static async processPendingFollowUps() {
    console.log(`\n🔍 Processing pending follow-ups...\n`);

    // Find main emails sent in the last day that don't have follow-ups scheduled yet
    const recentMainEmails = db.prepare(`
      SELECT
        ol.id as log_id,
        ol.lead_id,
        ol.blog_lead_id,
        ol.email_id,
        ol.blog_email_id,
        ol.sent_at,
        l.campaign_id,
        c.brand_id
      FROM outreach_logs ol
      LEFT JOIN leads l ON ol.lead_id = l.id
      LEFT JOIN blog_leads bl ON ol.blog_lead_id = bl.id
      LEFT JOIN campaigns c ON (l.campaign_id = c.id OR bl.campaign_id = c.id)
      WHERE ol.email_category = 'main'
        AND ol.status = 'SENT'
        AND DATE(ol.sent_at) >= DATE('now', '-1 day')
      ORDER BY ol.sent_at DESC
    `).all();

    let processed = 0;

    for (const log of recentMainEmails) {
      // Check if follow-ups are already scheduled
      const existingFollowUps = db.prepare(`
        SELECT COUNT(*) as count
        FROM email_queue
        WHERE parent_log_id = ?
          AND email_category IN ('followup_1', 'followup_2', 'followup_3', 'followup_4')
      `).get(log.log_id);

      if (existingFollowUps.count > 0) {
        console.log(`  ⊗ Skip log #${log.log_id}: Follow-ups already scheduled`);
        continue;
      }

      // Get email IDs
      let emailId = null;
      let blogEmailId = null;

      if (log.blog_lead_id) {
        const lead = db.prepare("SELECT blog_prospect_id FROM blog_leads WHERE id = ?").get(log.blog_lead_id);
        if (lead) {
          const email = db.prepare("SELECT id FROM blog_emails WHERE blog_prospect_id = ? LIMIT 1").get(lead.blog_prospect_id);
          blogEmailId = email?.id;
        }
      } else if (log.lead_id) {
        const lead = db.prepare("SELECT prospect_id FROM leads WHERE id = ?").get(log.lead_id);
        if (lead) {
          const email = db.prepare("SELECT id FROM emails WHERE prospect_id = ? LIMIT 1").get(lead.prospect_id);
          emailId = email?.id;
        }
      }

      if (!emailId && !blogEmailId) {
        console.log(`  ⊗ Skip log #${log.log_id}: No email found`);
        continue;
      }

      console.log(`\n  → Processing log #${log.log_id} (${log.sent_at})`);

      // Schedule follow-ups
      const result = await this.scheduleFollowUps(
        log.log_id,
        log.lead_id,
        log.blog_lead_id,
        emailId,
        blogEmailId,
        log.brand_id
      );

      if (result.scheduled > 0) {
        processed++;
      }
    }

    console.log(`\n✅ Processed ${processed} main emails for follow-up scheduling\n`);
    return { processed };
  }

  /**
   * Get follow-up schedule for a lead
   */
  static getFollowUpSchedule(leadId, blogLeadId = null) {
    const query = blogLeadId
      ? `
        SELECT
          eq.id,
          eq.email_category,
          eq.sequence_number,
          eq.scheduled_for,
          eq.status,
          et.name as template_name
        FROM email_queue eq
        LEFT JOIN email_templates et ON eq.template_id = et.id
        WHERE eq.blog_lead_id = ?
          AND eq.email_category IN ('followup_1', 'followup_2', 'followup_3', 'followup_4')
        ORDER BY eq.sequence_number ASC
      `
      : `
        SELECT
          eq.id,
          eq.email_category,
          eq.sequence_number,
          eq.scheduled_for,
          eq.status,
          et.name as template_name
        FROM email_queue eq
        LEFT JOIN email_templates et ON eq.template_id = et.id
        WHERE eq.lead_id = ?
          AND eq.email_category IN ('followup_1', 'followup_2', 'followup_3', 'followup_4')
        ORDER BY eq.sequence_number ASC
      `;

    return db.prepare(query).all(leadId);
  }

  /**
   * Cancel pending follow-ups for a lead
   */
  static cancelFollowUps(leadId, blogLeadId = null) {
    const query = blogLeadId
      ? `DELETE FROM email_queue WHERE blog_lead_id = ? AND status = 'pending' AND email_category LIKE 'followup_%'`
      : `DELETE FROM email_queue WHERE lead_id = ? AND status = 'pending' AND email_category LIKE 'followup_%'`;

    const result = db.prepare(query).run(leadId);
    console.log(`  ✓ Cancelled ${result.changes} follow-up emails`);
    return { cancelled: result.changes };
  }

  /**
   * Update follow-up schedule configuration in database
   */
  static updateScheduleConfig(newSchedule) {
    const updateStmt = db.prepare(`
      INSERT OR REPLACE INTO system_settings (key, value, description)
      VALUES (?, ?, COALESCE((SELECT description FROM system_settings WHERE key = ?), ''))
    `);

    for (const [key, value] of Object.entries(newSchedule)) {
      const dbKey = `${key}_interval_days`;
      updateStmt.run(dbKey, value, dbKey);
    }

    console.log(`✅ Follow-up schedule updated in database`);
    return this.getScheduleConfig();
  }

  /**
   * Get current schedule configuration from database
   */
  static getScheduleConfig() {
    return this.getScheduleFromDB();
  }

  /**
   * Get all follow-up settings from database (for admin display)
   */
  static getAllSettings() {
    const settings = db.prepare(`
      SELECT key, value, description
      FROM system_settings
      WHERE key LIKE 'followup_%' OR key = 'auto_schedule_followups'
      ORDER BY key
    `).all();

    return settings;
  }
}

export default FollowUpService;
