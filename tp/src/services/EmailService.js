import nodemailer from "nodemailer";
import SmtpConfigRepo from "../repositories/SmtpConfigRepo.js";
import EmailQueueRepo from "../repositories/EmailQueueRepo.js";
import { DailyLimitService } from "./DailyLimitService.js";
import TemplateService from "./TemplateService.js";
import { db } from "../database/db.js";

class EmailService {
  /**
   * Get Nodemailer transporter with active SMTP config
   */
  static getTransporter() {
    const config = SmtpConfigRepo.getActive();

    if (!config) {
      throw new Error(
        "No active SMTP configuration found. Please configure SMTP settings."
      );
    }

    const transporterConfig = {
      host: config.host,
      port: config.port,
      secure: config.secure === 1,
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
      const config = SmtpConfigRepo.getActive();

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

      // Send the email
      const result = await this.sendEmail(
        queueItem.to_email,
        rendered.subject,
        rendered.body
      );

      if (result.success) {
        // Update lead status (check if blog lead or regular lead)
        if (queueItem.blog_lead_id) {
          db.prepare(
            `
            UPDATE blog_leads
            SET status = 'OUTREACH_SENT'
            WHERE id = ?
          `
          ).run(queueItem.blog_lead_id);
        } else if (queueItem.lead_id) {
          db.prepare(
            `
            UPDATE leads
            SET status = 'OUTREACH_SENT'
            WHERE id = ?
          `
          ).run(queueItem.lead_id);
        }

        // Mark queue as sent
        EmailQueueRepo.markAsSent(queueItem.id, result.messageId);

        console.log(
          `  ✓ Sent to ${queueItem.to_email} (Message ID: ${result.messageId})`
        );
        return { success: true, messageId: result.messageId };
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
