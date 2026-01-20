import express from "express";
import { db } from "../../database/db.js";

const router = express.Router();

// List all general outreach emails (Master Email Entity List)
router.get("/leads/general", (req, res) => {
  try {
    const { search, source } = req.query;

    let query = `
      SELECT
        e.id as email_id,
        e.email,
        e.source_page,
        e.is_domain_match,
        e.is_generic,
        e.confidence,
        e.created_at,
        p.id as prospect_id,
        p.domain,
        p.company_name,
        p.city,
        p.country
      FROM emails e
      JOIN prospects p ON e.prospect_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query +=
        " AND (p.company_name LIKE ? OR p.domain LIKE ? OR e.email LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (source) {
      query += " AND p.last_source_type = ?";
      params.push(source);
    }

    query += " ORDER BY e.created_at DESC LIMIT 500";

    const emails = db.prepare(query).all(...params);

    // Get filter options
    const sources = db
      .prepare(
        "SELECT DISTINCT last_source_type FROM prospects WHERE last_source_type IS NOT NULL"
      )
      .all()
      .map((s) => s.last_source_type);

    // Get active templates and campaigns for queueing
    const templates = db
      .prepare(
        "SELECT id, name FROM email_templates WHERE is_active = 1 ORDER BY name"
      )
      .all();
    const campaigns = db
      .prepare("SELECT id, name FROM campaigns ORDER BY name")
      .all(); // Needed to assign lead context

    res.render("leads/general-list", {
      emails,
      campaigns,
      sources,
      templates,
      filters: { search, source },
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading general leads:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to load general leads",
        user: req.session,
      });
  }
});

// List all leads with filters (now shows blog leads for link exchange/guest posts)
router.get("/leads", (req, res) => {
  try {
    const { campaign, status, source } = req.query;

    let query = `
      SELECT
        bl.*,
        bp.domain,
        bp.blog_name,
        c.name as campaign_name,
        b.name as brand_name,
        be.email,
        be.id as email_id
      FROM blog_leads bl
      LEFT JOIN blog_prospects bp ON bl.blog_prospect_id = bp.id
      LEFT JOIN campaigns c ON bl.campaign_id = c.id
      LEFT JOIN brands b ON c.brand_id = b.id
      LEFT JOIN blog_emails be ON bp.id = be.blog_prospect_id
      WHERE 1=1
    `;
    const params = [];

    if (campaign) {
      query += " AND bl.campaign_id = ?";
      params.push(campaign);
    }

    if (status) {
      query += " AND bl.status = ?";
      params.push(status);
    }

    if (source) {
      query += " AND bl.source_type = ?";
      params.push(source);
    }

    query += " ORDER BY bl.found_at DESC LIMIT 500";

    const leads = db.prepare(query).all(...params);

    // Get filter options
    const campaigns = db
      .prepare("SELECT id, name FROM campaigns ORDER BY name")
      .all();
    const statuses = ["NEW", "READY", "OUTREACH_SENT", "REPLIED", "REJECTED"];
    const sources = db
      .prepare(
        `
      SELECT DISTINCT source_type
      FROM blog_leads
      WHERE source_type IS NOT NULL
      ORDER BY source_type
    `
      )
      .all()
      .map((s) => s.source_type);

    // Get active templates for queueing
    const templates = db
      .prepare(
        "SELECT id, name FROM email_templates WHERE is_active = 1 ORDER BY name"
      )
      .all();

    res.render("leads/list", {
      leads,
      campaigns,
      statuses,
      sources,
      templates,
      filters: { campaign, status, source },
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading leads:", error);
    res
      .status(500)
      .render("error", { error: "Failed to load leads", user: req.session });
  }
});

// View single blog lead
router.get("/leads/:id", (req, res) => {
  try {
    const lead = db
      .prepare(
        `
      SELECT
        bl.*,
        bp.domain,
        bp.blog_name,
        bp.website_url as blog_website_url,
        c.name as campaign_name,
        c.id as campaign_id,
        b.name as brand_name,
        b.id as brand_id
      FROM blog_leads bl
      JOIN blog_prospects bp ON bl.blog_prospect_id = bp.id
      JOIN campaigns c ON bl.campaign_id = c.id
      JOIN brands b ON c.brand_id = b.id
      WHERE bl.id = ?
    `
      )
      .get(req.params.id);

    if (!lead) {
      return res
        .status(404)
        .render("error", { error: "Lead not found", user: req.session });
    }

    // Get emails for this blog prospect
    const emails = db
      .prepare(
        `
      SELECT * FROM blog_emails WHERE blog_prospect_id = ?
    `
      )
      .all(lead.blog_prospect_id);

    // Get campaign assets for outreach
    const assets = db
      .prepare(
        `
      SELECT * FROM campaign_assets WHERE campaign_id = ?
    `
      )
      .all(lead.campaign_id);

    // Get outreach logs for this lead
    const outreachLogs = db
      .prepare(
        `
      SELECT
        ol.*,
        ca.title as asset_title,
        ca.url as asset_url,
        be.email
      FROM outreach_logs ol
      LEFT JOIN campaign_assets ca ON ol.asset_id = ca.id
      LEFT JOIN blog_emails be ON ol.email_id = be.id
      WHERE ol.lead_id = ?
      ORDER BY ol.sent_at DESC
    `
      )
      .all(lead.id);

    res.render("leads/detail", {
      lead,
      emails,
      assets,
      outreachLogs,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading lead details:", error);
    res.status(500).render("error", {
      error: "Failed to load lead details",
      user: req.session,
    });
  }
});

// Update lead status
router.post("/leads/:id/status", (req, res) => {
  try {
    const { status } = req.body;
    const id = req.params.id;

    const stmt = db.prepare("UPDATE blog_leads SET status = ? WHERE id = ?");
    stmt.run(status, id);

    res.redirect("/leads");
  } catch (error) {
    console.error("Error updating lead status:", error);
    res.status(500).render("error", {
      error: "Failed to update lead status: " + error.message,
      user: req.session,
    });
  }
});

// Bulk update lead status
router.post("/leads/bulk-update", (req, res) => {
  try {
    const { lead_ids, status } = req.body;

    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return res.redirect("/leads");
    }

    const stmt = db.prepare("UPDATE blog_leads SET status = ? WHERE id = ?");
    const updateMany = db.transaction((ids) => {
      for (const id of ids) {
        stmt.run(status, id);
      }
    });

    updateMany(lead_ids);

    res.redirect("/leads");
  } catch (error) {
    console.error("Error bulk updating leads:", error);
    res.status(500).render("error", {
      error: "Failed to bulk update leads: " + error.message,
      user: req.session,
    });
  }
});

// Outreach logs
router.get("/outreach-logs", (req, res) => {
  try {
    const { campaign, status } = req.query;

    // Query that combines both regular leads and blog leads
    let query = `
      SELECT
        ol.id,
        ol.status,
        ol.sent_at,
        ol.lead_id,
        ol.blog_lead_id,
        c.name as campaign_name,
        ca.title as asset_title,
        -- Regular lead data
        p.domain,
        p.company_name,
        e.email,
        -- Blog lead data
        bp.domain as blog_domain,
        bp.blog_name,
        be.email as blog_email
      FROM outreach_logs ol
      LEFT JOIN leads l ON ol.lead_id = l.id
      LEFT JOIN blog_leads bl ON ol.blog_lead_id = bl.id
      LEFT JOIN campaigns c ON COALESCE(l.campaign_id, bl.campaign_id) = c.id
      LEFT JOIN campaign_assets ca ON ol.asset_id = ca.id
      LEFT JOIN emails e ON ol.email_id = e.id
      LEFT JOIN prospects p ON l.prospect_id = p.id
      LEFT JOIN blog_emails be ON ol.blog_email_id = be.id
      LEFT JOIN blog_prospects bp ON bl.blog_prospect_id = bp.id
      WHERE 1=1
    `;
    const params = [];

    if (campaign) {
      query += " AND COALESCE(l.campaign_id, bl.campaign_id) = ?";
      params.push(campaign);
    }

    if (status) {
      query += " AND ol.status = ?";
      params.push(status);
    }

    query += " ORDER BY ol.sent_at DESC LIMIT 500";

    const logs = db.prepare(query).all(...params);

    // Normalize logs for display (use blog or regular lead data)
    const normalizedLogs = logs.map(log => ({
      ...log,
      domain: log.blog_domain || log.domain,
      company_name: log.blog_name || log.company_name,
      email: log.blog_email || log.email
    }));

    // Get filter options
    const campaigns = db
      .prepare("SELECT id, name FROM campaigns ORDER BY name")
      .all();
    const statuses = ["SENT", "OPENED", "REPLIED", "REJECTED"];

    res.render("leads/outreach-logs", {
      logs: normalizedLogs,
      campaigns,
      statuses,
      filters: { campaign, status },
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading outreach logs:", error);
    res.status(500).render("error", {
      error: "Failed to load outreach logs",
      user: req.session,
    });
  }
});

export default router;
