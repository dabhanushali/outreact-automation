import nodemailer from "nodemailer";
import SmtpConfigRepo from "../repositories/SmtpConfigRepo.js";
import { BrandRepo } from "../repositories/BrandRepo.js";
import EmailQueueRepo from "../repositories/EmailQueueRepo.js";
import { DailyLimitService } from "./DailyLimitService.js";
import TemplateService from "./TemplateService.js";
import { db } from "../database/db.js";

class EmailService {
  /**
   * Get active SMTP configuration
   * First tries to get brand-specific SMTP, falls back to legacy smtp_config table
   */
  static getActiveConfig() {
    // Try brand-specific SMTP first
    const brand = BrandRepo.getActiveSMTP();

    if (brand && brand.smtp_is_active) {
      // Use brand SMTP config
      return {
        host: brand.smtp_host,
        port: brand.smtp_port,
        secure: brand.smtp_secure === 1,
        user: brand.smtp_user,
        password: brand.smtp_password,
        from_name: brand.smtp_from_name,
        from_email: brand.smtp_from_email,
      };
    }

    // Fallback to legacy smtp_config table
    const legacyConfig = SmtpConfigRepo.getActive();
    if (!legacyConfig) {
      throw new Error(
        "No active SMTP configuration found. Please configure SMTP settings in Brands."
      );
    }
    return {
      host: legacyConfig.host,
      port: legacyConfig.port,
      secure: legacyConfig.secure === 1,
      user: legacyConfig.user,
      password: legacyConfig.password,
      from_name: legacyConfig.from_name,
      from_email: legacyConfig.from_email,
    };
  }

  /**
   * Get Nodemailer transporter with active SMTP config
   */
  static getTransporter() {
    const config = this.getActiveConfig();

    const transporterConfig = {
      host: config.host,
      port: config.port,
      secure: config.secure,
    };

    if (config.user) {
      transporterConfig.auth = {
        user: config.user,
        pass: config.password,
      };
    }

    return nodemailer.createTransport(transporterConfig);
  }

  /**
   * Test SMTP connection
   */
  static async testConnection() {
    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      return { success: true, message: "SMTP connection successful!" };
    } catch (error) {
      return {
        success: false,
        message: `SMTP connection failed: ${error.message}`,
      };
    }
  }

  /**
   * Send individual email
   */
  static async sendEmail(to, subject, body, fromName = null, fromEmail = null) {
    try {
      const transporter = this.getTransporter();
      const config = this.getActiveConfig();

      const mailOptions = {
        from: `"${fromName || config.from_name || "Outreach Team"}" <${
          fromEmail || config.from_email
        }>`,
        to: to,
        subject: subject,
        html: body,
      };

      const info = await transporter.sendMail(mailOptions);
      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email with specific brand SMTP config
   */
  static async sendEmailWithBrand(to, subject, body, brandConfig) {
    try {
      console.log("\n📧 Email Sending Configuration:");
      console.log("  To:", to);
      console.log("  Brand Config:", JSON.stringify({
        smtp_host: brandConfig?.smtp_host,
        smtp_port: brandConfig?.smtp_port,
        smtp_secure: brandConfig?.smtp_secure,
        smtp_user: brandConfig?.smtp_user ? "***" : "(none)",
        smtp_from_email: brandConfig?.smtp_from_email,
      }, null, 2));

      if (!brandConfig || !brandConfig.smtp_host) {
        console.log("  ❌ Error: Invalid brand SMTP configuration");
        console.log("     - brandConfig:", brandConfig);
        throw new Error("Invalid brand SMTP configuration");
      }

      // Create transporter with brand config
      const transporterConfig = {
        host: brandConfig.smtp_host,
        port: brandConfig.smtp_port,
        secure: brandConfig.smtp_secure === 1,
      };

      if (brandConfig.smtp_user) {
        transporterConfig.auth = {
          user: brandConfig.smtp_user,
          pass: brandConfig.smtp_password,
        };
      }

      console.log("  ✅ Transporter config:", JSON.stringify({
        host: transporterConfig.host,
        port: transporterConfig.port,
        secure: transporterConfig.secure,
        hasAuth: !!transporterConfig.auth,
      }, null, 2));

      const transporter = nodemailer.createTransport(transporterConfig);

      const mailOptions = {
        from: `"${brandConfig.smtp_from_name || "Outreach Team"}" <${brandConfig.smtp_from_email}>`,
        to: to,
        subject: subject,
        html: body,
      };

      console.log("  📨 Sending mail...");

      const info = await transporter.sendMail(mailOptions);
      console.log("  ✅ Email sent successfully! Message ID:", info.messageId);

      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
      };
    } catch (error) {
      console.log("  ❌ Error sending email:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send queued email
   */
  static async sendQueuedEmail(queueItem) {
    try {
      // Mark as sending
      EmailQueueRepo.markAsSending(queueItem.id);

      // Re-render template to ensure all variables are fresh (especially links)
      // queueItem contains all necessary data due to the join in getPendingEmails
      const rendered = TemplateService.renderTemplate(
        { subject: queueItem.subject, body: queueItem.body },
        queueItem
      );

      // Prepare brand config from queue item
      const brandConfig = {
        smtp_host: queueItem.smtp_host,
        smtp_port: queueItem.smtp_port,
        smtp_secure: queueItem.smtp_secure,
        smtp_user: queueItem.smtp_user,
        smtp_password: queueItem.smtp_password,
        smtp_from_name: queueItem.smtp_from_name,
        smtp_from_email: queueItem.smtp_from_email,
      };

      // Send the email using brand SMTP
      const result = await this.sendEmailWithBrand(
        queueItem.to_email,
        rendered.subject,
        rendered.body,
        brandConfig
      );

      if (result.success) {
        // Update lead status (check if blog lead or regular lead)
        let campaignId = null;
        if (queueItem.blog_lead_id) {
          const lead = db.prepare("SELECT campaign_id FROM blog_leads WHERE id = ?").get(queueItem.blog_lead_id);
          if (lead) campaignId = lead.campaign_id;
          db.prepare(
            `
            UPDATE blog_leads
            SET status = 'OUTREACH_SENT'
            WHERE id = ?
          `
          ).run(queueItem.blog_lead_id);
        } else if (queueItem.lead_id) {
          const lead = db.prepare("SELECT campaign_id FROM leads WHERE id = ?").get(queueItem.lead_id);
          if (lead) campaignId = lead.campaign_id;
          db.prepare(
            `
            UPDATE leads
            SET status = 'OUTREACH_SENT'
            WHERE id = ?
          `
          ).run(queueItem.lead_id);
        }

        // Get email category and sequence from template or queue item
        const emailCategory = queueItem.email_category || queueItem.template_category || 'main';
        const sequenceNumber = queueItem.sequence_number || queueItem.template_sequence || 0;

        // Insert into outreach_logs with tracking
        const logResult = db.prepare(
          `
          INSERT INTO outreach_logs (
            lead_id, blog_lead_id, email_id, blog_email_id, asset_id,
            email_category, sequence_number, parent_log_id, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SENT')
          `
        ).run(
          queueItem.lead_id || null,
          queueItem.blog_lead_id || null,
          queueItem.email_id || null,
          queueItem.blog_email_id || null,
          null,  // asset_id can be null - represents general outreach
          emailCategory,
          sequenceNumber,
          queueItem.parent_log_id || null
        );

        // Mark queue as sent
        EmailQueueRepo.markAsSent(queueItem.id, result.messageId);

        console.log(
          `  ✓ Sent to ${queueItem.to_email} (${emailCategory} #${sequenceNumber}, Message ID: ${result.messageId})`
        );

        return { success: true, messageId: result.messageId, logId: logResult.lastInsertRowid };
      } else {
        // Mark as failed
        EmailQueueRepo.markAsFailed(queueItem.id, result.error);
        console.error(
          `  ✗ Failed to send to ${queueItem.to_email}: ${result.error}`
        );
        return { success: false, error: result.error };
      }
    } catch (error) {
      EmailQueueRepo.markAsFailed(queueItem.id, error.message);
      console.error(
        `  ✗ Error sending to ${queueItem.to_email}: ${error.message}`
      );
      return { success: false, error: error.message };
    }
  }

  static isSending = false;

  /**
   * Process email queue with rate limiting
   */
  static async processQueue() {
    if (this.isSending) {
      console.log("⚠ Email sending already in progress.");
      return {
        processed: 0,
        sent: 0,
        failed: 0,
        limitReached: false,
        message: "Already sending",
      };
    }

    this.isSending = true;

    try {
      console.log("\n📧 Processing Email Queue...\n");

      // Get daily email limit from settings
      const dailyLimit = DailyLimitService.getSetting(
        "daily_outreach_limit",
        50
      );

      // Check how many emails have been sent today
      const sentToday = EmailQueueRepo.countSentToday();
      console.log(`  Emails sent today: ${sentToday}/${dailyLimit}`);

      if (sentToday >= dailyLimit) {
        console.log(
          `  ⚠ Daily limit reached (${dailyLimit} emails). Stopping.`
        );
        return { processed: 0, sent: 0, failed: 0, limitReached: true };
      }

      // Calculate how many more emails we can send
      const remaining = dailyLimit - sentToday;

      // Get pending emails
      const pendingEmails = EmailQueueRepo.getPendingEmails(remaining);

      if (pendingEmails.length === 0) {
        console.log(`  ℹ No pending emails in queue.`);
        return { processed: 0, sent: 0, failed: 0, limitReached: false };
      }

      console.log(`  📬 Found ${pendingEmails.length} pending emails`);
      console.log(
        `  📤 Will send ${Math.min(
          pendingEmails.length,
          remaining
        )} emails (respects daily limit)\n`
      );

      let sent = 0;
      let failed = 0;

      for (let i = 0; i < pendingEmails.length; i++) {
        const email = pendingEmails[i];

        // Check if we've hit the daily limit
        const currentSent = EmailQueueRepo.countSentToday();
        if (currentSent >= dailyLimit) {
          console.log(
            `\n  ⚠ Daily limit reached (${dailyLimit} emails). Stopping.`
          );
          break;
        }

        console.log(
          `[${i + 1}/${pendingEmails.length}] Sending to ${email.to_email} (${
            email.company_name || email.domain
          })`
        );

        const result = await this.sendQueuedEmail(email);

        if (result.success) {
          sent++;
        } else {
          failed++;
        }

        // Add random delay between sends (30-60 seconds)
        if (i < pendingEmails.length - 1) {
          const delay = Math.floor(Math.random() * 30000) + 30000;
          console.log(
            `  ⏳ Waiting ${Math.round(delay / 1000)}s before next email...\n`
          );
          await this.sleep(delay);
        }
      }

      console.log(`\n📊 Queue Processing Summary:`);
      console.log(`  Sent: ${sent}`);
      console.log(`  Failed: ${failed}`);
      console.log(`  Total: ${sent + failed}\n`);

      return {
        processed: sent + failed,
        sent,
        failed,
        limitReached: sentToday + sent >= dailyLimit,
      };
    } finally {
      this.isSending = false;
    }
  }

  /**
   * Sleep helper for delays
   */
  static sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get queue statistics
   */
  static getQueueStats() {
    return EmailQueueRepo.getQueueStats();
  }
}

export default EmailService;
