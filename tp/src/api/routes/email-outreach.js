import express from "express";
import { db } from "../../database/db.js";
import EmailTemplateRepo from "../../repositories/EmailTemplateRepo.js";
import SmtpConfigRepo from "../../repositories/SmtpConfigRepo.js";
import EmailQueueService from "../../services/EmailQueueService.js";
import TemplateService from "../../services/TemplateService.js";
import EmailService from "../../services/EmailService.js";

const router = express.Router();

// ============================================
// EMAIL TEMPLATES
// ============================================

// List all templates
router.get("/email-outreach/templates", (req, res) => {
  try {
    const templates = TemplateService.getAllTemplates();
    res.render("email-outreach/templates", {
      templates,
      availableVariables: TemplateService.getAvailableVariables(),
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading templates:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to load templates",
        user: req.session,
      });
  }
});

// Create new template
router.post("/email-outreach/templates", (req, res) => {
  try {
    const { name, subject, body, is_active } = req.body;

    if (!name || !subject || !body) {
      return res.status(400).render("error", {
        error: "Name, subject, and body are required",
        user: req.session,
      });
    }

    TemplateService.createTemplate({
      name,
      subject,
      body,
      is_active: is_active === "1" || is_active === true,
    });

    res.redirect("/email-outreach/templates");
  } catch (error) {
    console.error("Error creating template:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to create template: " + error.message,
        user: req.session,
      });
  }
});

// View/edit template
router.get("/email-outreach/templates/:id", (req, res) => {
  try {
    const template = TemplateService.getTemplate(req.params.id);
    if (!template) {
      return res
        .status(404)
        .render("error", { error: "Template not found", user: req.session });
    }

    const campaigns = db
      .prepare("SELECT id, name FROM campaigns ORDER BY name")
      .all();

    res.render("email-outreach/template-detail", {
      template,
      campaigns,
      availableVariables: TemplateService.getAvailableVariables(),
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading template:", error);
    res
      .status(500)
      .render("error", { error: "Failed to load template", user: req.session });
  }
});

// Update template
router.post("/email-outreach/templates/:id/update", (req, res) => {
  try {
    const { name, subject, body, is_active } = req.body;

    TemplateService.updateTemplate(req.params.id, {
      name,
      subject,
      body,
      is_active: is_active === "1" || is_active === true,
    });

    res.redirect(`/email-outreach/templates/${req.params.id}`);
  } catch (error) {
    console.error("Error updating template:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to update template: " + error.message,
        user: req.session,
      });
  }
});

// Delete template
router.post("/email-outreach/templates/:id/delete", (req, res) => {
  try {
    TemplateService.deleteTemplate(req.params.id);
    res.redirect("/email-outreach/templates");
  } catch (error) {
    console.error("Error deleting template:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to delete template",
        user: req.session,
      });
  }
});

// Preview template
router.get("/email-outreach/templates/:id/preview", (req, res) => {
  try {
    const preview = TemplateService.previewTemplate(req.params.id);
    res.json({ success: true, preview });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// EMAIL QUEUE
// ============================================

// View email queue
router.get("/email-outreach/queue", (req, res) => {
  try {
    const { status } = req.query;
    const queuedEmails = EmailQueueService.getAllQueued(status, 100);
    const stats = EmailQueueService.getQueueStats();

    // Get campaigns for queuing
    const campaigns = db
      .prepare("SELECT id, name FROM campaigns ORDER BY name")
      .all();

    // Get all brands for SMTP selection
    const brands = db
      .prepare(
        "SELECT id, name, smtp_is_active, smtp_host FROM brands ORDER BY name"
      )
      .all();

    res.render("email-outreach/queue", {
      queuedEmails,
      stats,
      campaigns,
      brands,
      filters: { status },
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading queue:", error);
    res
      .status(500)
      .render("error", { error: "Failed to load queue", user: req.session });
  }
});

// Get ready leads for queuing (AJAX)
router.get("/email-outreach/queue/ready-leads", (req, res) => {
  try {
    const { campaign_id } = req.query;
    const leads = EmailQueueService.getReadyLeads(campaign_id || null, 50);
    res.json({ success: true, leads });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add leads to queue
router.post("/email-outreach/queue/add", (req, res) => {
  try {
    const { brand_id, lead_ids, email_ids, template_id } = req.body;

    if (!brand_id || !lead_ids || !email_ids || !template_id) {
      return res
        .status(400)
        .json({ success: false, error: "Missing required fields" });
    }

    // Parse arrays
    const leadIds = Array.isArray(lead_ids) ? lead_ids : [lead_ids];
    const emailIds = Array.isArray(email_ids) ? email_ids : [email_ids];

    const result = EmailQueueService.queueSelectedLeads(
      leadIds,
      emailIds,
      template_id,
      brand_id
    );

    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Error adding to queue:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk Queue for General Leads (Auto-creates leads if missing)
router.post("/email-outreach/queue/general-bulk", (req, res) => {
  try {
    const { items, campaign_id, template_id } = req.body;

    if (!items || !campaign_id || !template_id) {
       return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const leadIds = [];
    const emailIds = [];
    let leadsCreated = 0;

    // TODO: Optimize this loop with a transaction or batch insert later
    const insertLeadStmt = db.prepare(`
      INSERT OR IGNORE INTO leads (brand_id, campaign_id, prospect_id, source_type, source_query)
      VALUES (
        (SELECT brand_id FROM campaigns WHERE id = ?),
        ?, ?, 'general-list', 'bulk-queue'
      )
    `);
    
    // Create new statement to get ID (since IGNORE might return nothing)
    const getLeadStmt = db.prepare("SELECT id FROM leads WHERE campaign_id = ? AND prospect_id = ?");

    db.transaction(() => {
      for (const item of items) {
         // Create lead if not exists
         insertLeadStmt.run(campaign_id, campaign_id, item.prospect_id);
         
         const lead = getLeadStmt.get(campaign_id, item.prospect_id);
         if (lead) {
            leadIds.push(lead.id);
            emailIds.push(item.email_id);
         }
      }
    })();

    // Get brand_id from campaign
    const campaign = db.prepare('SELECT brand_id FROM campaigns WHERE id = ?').get(campaign_id);
    const brandId = campaign?.brand_id || null;

    // Queue them with brand_id
    const result = EmailQueueService.queueSelectedLeads(leadIds, emailIds, template_id, brandId);

    res.json({ 
      success: true, 
      leadsProcessed: leadIds.length,
      queued: result.queued, 
      failed: result.failed,
      errors: result.errors 
    });

  } catch (error) {
    console.error("Error processing general bulk queue:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Queue for general leads page - uses existing lead campaigns
router.post("/email-outreach/queue/general-leads", (req, res) => {
  try {
    const { lead_ids, email_ids, items_to_create, template_id } = req.body;

    if (!template_id) {
      return res.status(400).json({ success: false, error: "Template is required" });
    }

    const allLeadIds = [];
    const allEmailIds = [];
    let failed = 0;

    // Process existing leads (use their existing campaigns)
    if (lead_ids && lead_ids.length > 0) {
      allLeadIds.push(...lead_ids);
      allEmailIds.push(...email_ids);
    }

    // For prospects without leads, skip them (require manual lead creation with campaign)
    if (items_to_create && items_to_create.length > 0) {
      console.log(`Skipping ${items_to_create.length} prospects without leads - they need to be assigned to a campaign first`);
    }

    if (allLeadIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid leads to queue. Selected prospects don't have leads assigned. Please create leads for them first with a campaign."
      });
    }

    // Get brand_ids from the leads (may have different brands)
    const leads = db.prepare(`
      SELECT DISTINCT l.id, c.brand_id
      FROM leads l
      JOIN campaigns c ON l.campaign_id = c.id
      WHERE l.id IN (${allLeadIds.map(() => '?').join(',')})
    `).all(...allLeadIds);

    if (leads.length === 0) {
      return res.status(400).json({ success: false, error: "No valid leads found" });
    }

    // Group by brand_id since we can only queue one brand at a time
    const brandGroups = {};
    leads.forEach(lead => {
      if (!brandGroups[lead.brand_id]) {
        brandGroups[lead.brand_id] = [];
      }
      brandGroups[lead.brand_id].push(lead.id);
    });

    // Use the first brand (or handle multiple brands)
    const brandIds = Object.keys(brandGroups);
    if (brandIds.length > 1) {
      return res.status(400).json({
        success: false,
        error: `Selected leads belong to ${brandIds.length} different brands. Please select leads from the same brand.`
      });
    }

    const brandId = brandIds[0];

    // Queue them
    const result = EmailQueueService.queueSelectedLeads(allLeadIds, allEmailIds, template_id, brandId);

    res.json({
      success: true,
      queued: result.queued,
      failed: result.failed + failed,
      errors: result.errors || []
    });

  } catch (error) {
    console.error("Error queuing general leads:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Queue campaign leads
router.post("/email-outreach/queue/campaign", (req, res) => {
  try {
    const { campaign_id, template_id, limit } = req.body;

    if (!campaign_id || !template_id) {
      return res.status(400).render("error", {
        error: "Campaign and template are required",
        user: req.session,
      });
    }

    const result = EmailQueueService.queueCampaignLeads(
      campaign_id,
      template_id,
      limit || null
    );

    res.redirect("/email-outreach/queue");
  } catch (error) {
    console.error("Error queuing campaign leads:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to queue leads: " + error.message,
        user: req.session,
      });
  }
});

// Clear pending queue
router.post("/email-outreach/queue/clear", (req, res) => {
  try {
    const result = EmailQueueService.clearQueue();
    res.redirect("/email-outreach/queue");
  } catch (error) {
    console.error("Error clearing queue:", error);
    res
      .status(500)
      .render("error", { error: "Failed to clear queue", user: req.session });
  }
});

// Process/send queued emails
router.post("/email-outreach/queue/send", (req, res) => {
  try {
    const { brand_id } = req.body;

    if (EmailService.isSending) {
      return res.json({
        success: true,
        message: "Email sending is already in progress in the background.",
      });
    }

    // Start process in background (do not await)
    EmailService.processQueue(brand_id)
      .then((result) => {
        console.log("Background email sending finished:", result);
      })
      .catch((error) => {
        console.error("Background email sending failed:", error);
      });

    res.json({
      success: true,
      message:
        "Email sending started in background. Check terminal for progress.",
    });
  } catch (error) {
    console.error("Error starting email sending:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete queue item
router.post("/email-outreach/queue/:id/delete", (req, res) => {
  try {
    EmailQueueService.deleteQueueItem(req.params.id);
    res.redirect("/email-outreach/queue");
  } catch (error) {
    console.error("Error deleting queue item:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to delete queue item",
        user: req.session,
      });
  }
});

// ============================================
// SMTP CONFIGURATION
// ============================================

// View SMTP config
router.get("/email-outreach/smtp", (req, res) => {
  try {
    const config = SmtpConfigRepo.getActive();
    const allConfigs = SmtpConfigRepo.getAll();

    res.render("email-outreach/smtp", {
      config,
      allConfigs,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading SMTP config:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to load SMTP config",
        user: req.session,
      });
  }
});

// Save SMTP config
router.post("/email-outreach/smtp/config", (req, res) => {
  try {
    const { host, port, secure, user, password, from_name, from_email } =
      req.body;

    if (!host || !port || !from_email) {
      return res.status(400).render("error", {
        error: "Host, port, and from_email are required",
        user: req.session,
      });
    }

    SmtpConfigRepo.create({
      host,
      port: parseInt(port),
      secure: secure === "1" || secure === true,
      user: user || "",
      password: password || "",
      from_name: from_name || "",
      from_email,
    });

    res.redirect("/email-outreach/smtp");
  } catch (error) {
    console.error("Error saving SMTP config:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to save SMTP config: " + error.message,
        user: req.session,
      });
  }
});

// Test SMTP connection
router.post("/email-outreach/smtp/test", async (req, res) => {
  try {
    const result = await EmailService.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// EMAIL OUTREACH DASHBOARD
// ============================================

// Main dashboard
router.get("/email-outreach", (req, res) => {
  try {
    const stats = EmailService.getQueueStats();
    const templates = TemplateService.getActiveTemplates();
    const campaigns = db
      .prepare("SELECT id, name FROM campaigns ORDER BY name")
      .all();

    res.render("email-outreach/index", {
      stats,
      templates,
      campaigns,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading dashboard:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to load dashboard",
        user: req.session,
      });
  }
});

export default router;
