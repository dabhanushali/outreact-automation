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
   * Run this periodically (e.g., daily or on server startup)
   * - Excludes leads with REPLIED or REJECTED status
   * - Cancels follow-ups for leads that have replied or been rejected
   */
  static async processPendingFollowUps() {
    console.log(`\n🔍 Processing pending follow-ups...\n`);

    // Get follow-up schedule from database settings
    const schedule = this.getScheduleFromDB();
    console.log(`📅 Follow-up intervals:`, schedule);

    // Step 1: Cancel follow-ups for leads that have replied or been rejected
    console.log(`\n📋 Step 1: Checking for leads with REPLIED/REJECTED status...\n`);
    const cancelResult = this.cancelFollowUpsForRepliedOrRejected();
    console.log(`✅ Cancelled ${cancelResult.cancelled} follow-up emails for REPLIED/REJECTED leads\n`);

    // Step 2: Find leads that need follow-ups based on last email sent date
    console.log(`📬 Step 2: Checking for leads due for follow-ups...\n`);

    // Get all leads with their last sent email
    const leadsWithEmails = db.prepare(`
      SELECT
        ol.id as log_id,
        ol.lead_id,
        ol.blog_lead_id,
        ol.email_id,
        ol.blog_email_id,
        ol.sent_at as last_sent_at,
        ol.email_category as last_email_category,
        ol.sequence_number as last_sequence_number,
        l.status as lead_status,
        bl.status as blog_lead_status,
        l.campaign_id,
        c.brand_id
      FROM outreach_logs ol
      LEFT JOIN leads l ON ol.lead_id = l.id
      LEFT JOIN blog_leads bl ON ol.blog_lead_id = bl.id
      LEFT JOIN campaigns c ON (l.campaign_id = c.id OR bl.campaign_id = c.id)
      WHERE ol.status IN ('SENT', 'OPENED')
        AND ol.email_category IN ('main', 'followup_1', 'followup_2', 'followup_3', 'followup_4')
        AND DATE(ol.sent_at) >= DATE('now', '-60 days')
      ORDER BY ol.sent_at DESC
    `).all();

    let processed = 0;
    let scheduled = 0;
    let skipped = 0;

    for (const lead of leadsWithEmails) {
      // Check lead status - skip if REPLIED or REJECTED
      const leadStatus = lead.lead_status || lead.blog_lead_status;
      if (leadStatus === 'REPLIED' || leadStatus === 'REJECTED') {
        console.log(`  ⊗ Skip (Lead status: ${leadStatus})`);
        skipped++;
        continue;
      }

      // Calculate days since last email
      const lastSentDate = new Date(lead.last_sent_at);
      const today = new Date();
      const daysSinceLastEmail = Math.floor((today - lastSentDate) / (1000 * 60 * 60 * 24));

      console.log(`\n  → Lead #${lead.lead_id || lead.blog_lead_id}: Last email (${lead.last_email_category}) sent ${daysSinceLastEmail} days ago`);

      // Determine which follow-up should be sent next based on intervals
      let nextFollowUp = null;
      let intervalDays = 0;

      if (lead.last_email_category === 'main') {
        // After main email, check if followup_1 is due
        intervalDays = schedule.followup_1;
        if (daysSinceLastEmail >= intervalDays) {
          nextFollowUp = 'followup_1';
        }
      } else if (lead.last_email_category === 'followup_1') {
        // After followup_1, check if followup_2 is due
        intervalDays = schedule.followup_2 - schedule.followup_1;
        if (daysSinceLastEmail >= intervalDays) {
          nextFollowUp = 'followup_2';
        }
      } else if (lead.last_email_category === 'followup_2') {
        // After followup_2, check if followup_3 is due
        intervalDays = schedule.followup_3 - schedule.followup_2;
        if (daysSinceLastEmail >= intervalDays) {
          nextFollowUp = 'followup_3';
        }
      } else if (lead.last_email_category === 'followup_3') {
        // After followup_3, check if followup_4 is due
        intervalDays = schedule.followup_4 - schedule.followup_3;
        if (daysSinceLastEmail >= intervalDays) {
          nextFollowUp = 'followup_4';
        }
      } else if (lead.last_email_category === 'followup_4') {
        console.log(`  ⊗ All follow-ups completed`);
        skipped++;
        continue;
      }

      if (!nextFollowUp) {
        console.log(`  ⏳ Not due yet (need ${intervalDays} days, ${daysSinceLastEmail} days passed)`);
        skipped++;
        continue;
      }

      // Check if this follow-up is already scheduled or sent
      const existingFollowUp = db.prepare(`
        SELECT status, sent_at
        FROM email_queue
        WHERE parent_log_id = ?
          AND email_category = ?
        LIMIT 1
      `).get(lead.log_id, nextFollowUp);

      if (existingFollowUp) {
        if (existingFollowUp.status === 'sent') {
          console.log(`  ⊗ ${nextFollowUp} already sent`);
          skipped++;
        } else if (existingFollowUp.status === 'pending') {
          console.log(`  ⊗ ${nextFollowUp} already scheduled`);
          skipped++;
        } else {
          console.log(`  ⊗ ${nextFollowUp} status: ${existingFollowUp.status}`);
          skipped++;
        }
        continue;
      }

      // Get email IDs
      let emailId = null;
      let blogEmailId = null;

      if (lead.blog_lead_id) {
        const leadData = db.prepare("SELECT blog_prospect_id FROM blog_leads WHERE id = ?").get(lead.blog_lead_id);
        if (leadData) {
          const email = db.prepare("SELECT id FROM blog_emails WHERE blog_prospect_id = ? LIMIT 1").get(leadData.blog_prospect_id);
          blogEmailId = email?.id;
        }
      } else if (lead.lead_id) {
        const leadData = db.prepare("SELECT prospect_id FROM leads WHERE id = ?").get(lead.lead_id);
        if (leadData) {
          const email = db.prepare("SELECT id FROM emails WHERE prospect_id = ? LIMIT 1").get(leadData.prospect_id);
          emailId = email?.id;
        }
      }

      if (!emailId && !blogEmailId) {
        console.log(`  ⊗ No email found`);
        skipped++;
        continue;
      }

      // Get the template for this follow-up
      const template = db.prepare(`
        SELECT id, sequence_number
        FROM email_templates
        WHERE email_category = ?
          AND is_active = 1
        LIMIT 1
      `).get(nextFollowUp);

      if (!template) {
        console.log(`  ⊗ No active template found for ${nextFollowUp}`);
        skipped++;
        continue;
      }

      // Schedule immediately (send now since it's due)
      const scheduledDate = new Date();
      const scheduledFor = scheduledDate.toISOString().replace('T', ' ').slice(0, 19);

      // Prepare email data
      const prepared = TemplateService.prepareEmail(
        template.id,
        lead.lead_id || lead.blog_lead_id,
        blogEmailId || emailId
      );

      // Add to queue
      const result = EmailQueueRepo.addToQueue({
        brand_id: lead.brand_id,
        ...prepared,
        email_category: nextFollowUp,
        sequence_number: template.sequence_number,
        parent_log_id: lead.log_id,
        scheduled_for: scheduledFor,
      });

      scheduled++;
      console.log(`  ✓ ${nextFollowUp} scheduled (${daysSinceLastEmail} days since last email)`);
    }

    processed = leadsWithEmails.length;

    console.log(`\n✅ Follow-up processing complete:`);
    console.log(`   - Checked: ${processed} leads`);
    console.log(`   - Scheduled: ${scheduled} follow-ups`);
    console.log(`   - Skipped: ${skipped} leads (not due, already sent, or REPLIED/REJECTED)\n`);

    return { processed, scheduled, skipped, cancelled: cancelResult.cancelled };
  }

  /**
   * Cancel all pending follow-ups for leads that have replied or been rejected
   * Checks BOTH lead status (blog_leads/leads tables) AND outreach_logs status
   */
  static cancelFollowUpsForRepliedOrRejected() {
    let cancelled = 0;

    // Cancel for blog leads - check BOTH blog_leads.status AND outreach_logs.status
    const blogLeadsToCancel = db.prepare(`
      SELECT DISTINCT eq.id
      FROM email_queue eq
      WHERE eq.email_category LIKE 'followup_%'
        AND eq.status = 'pending'
        AND eq.blog_lead_id IS NOT NULL
        AND (
          -- Check if lead status is REPLIED/REJECTED
          eq.blog_lead_id IN (
            SELECT id FROM blog_leads WHERE status IN ('REPLIED', 'REJECTED')
          )
          OR
          -- Check if latest outreach log status is REPLIED/REJECTED
          eq.blog_lead_id IN (
            SELECT ol.blog_lead_id
            FROM outreach_logs ol
            WHERE ol.status IN ('REPLIED', 'REJECTED')
              AND ol.blog_lead_id IS NOT NULL
          )
        )
    `).all();

    for (const row of blogLeadsToCancel) {
      db.prepare("UPDATE email_queue SET status = 'cancelled' WHERE id = ?").run(row.id);
      cancelled++;
    }

    // Cancel for regular leads - check BOTH leads.status AND outreach_logs.status
    const leadsToCancel = db.prepare(`
      SELECT DISTINCT eq.id
      FROM email_queue eq
      WHERE eq.email_category LIKE 'followup_%'
        AND eq.status = 'pending'
        AND eq.lead_id IS NOT NULL
        AND (
          -- Check if lead status is REPLIED/REJECTED
          eq.lead_id IN (
            SELECT id FROM leads WHERE status IN ('REPLIED', 'REJECTED')
          )
          OR
          -- Check if latest outreach log status is REPLIED/REJECTED
          eq.lead_id IN (
            SELECT ol.lead_id
            FROM outreach_logs ol
            WHERE ol.status IN ('REPLIED', 'REJECTED')
              AND ol.lead_id IS NOT NULL
          )
        )
    `).all();

    for (const row of leadsToCancel) {
      db.prepare("UPDATE email_queue SET status = 'cancelled' WHERE id = ?").run(row.id);
      cancelled++;
    }

    return { cancelled };
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
