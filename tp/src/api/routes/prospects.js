import express from "express";
import { db } from "../../database/db.js";

const router = express.Router();

// List prospects with filters
router.get("/prospects", (req, res) => {
  try {
    const { campaign, source, status, search } = req.query;

    let query = `
      SELECT DISTINCT
        p.*,
        GROUP_CONCAT(DISTINCT c.name) as campaigns,
        COUNT(DISTINCT e.id) as email_count
      FROM prospects p
      LEFT JOIN leads l ON p.id = l.prospect_id
      LEFT JOIN campaigns c ON l.campaign_id = c.id
      LEFT JOIN emails e ON p.id = e.prospect_id
      WHERE 1=1
    `;
    const params = [];

    if (campaign) {
      query += " AND l.campaign_id = ?";
      params.push(campaign);
    }

    if (source) {
      query += " AND p.last_source_type = ?";
      params.push(source);
    }

    if (status) {
      if (status === "with_emails") {
        query += " AND p.emails_extracted = 1";
      } else if (status === "without_emails") {
        query += " AND p.emails_extracted = 0";
      }
    }

    if (search) {
      query += " AND (p.company_name LIKE ? OR p.domain LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    query += " GROUP BY p.id ORDER BY p.created_at DESC LIMIT 500";

    const prospects = db.prepare(query).all(...params);

    // Get filter options
    const campaigns = db
      .prepare("SELECT id, name FROM campaigns ORDER BY name")
      .all();
    const sources = db
      .prepare(
        `
      SELECT DISTINCT last_source_type
      FROM prospects
      WHERE last_source_type IS NOT NULL
      ORDER BY last_source_type
    `
      )
      .all()
      .map((s) => s.last_source_type);

    res.render("prospects/list", {
      prospects,
      campaigns,
      sources,
      filters: { campaign, source, status, search },
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading prospects:", error);
    res.status(500).render("error", {
      error: "Failed to load prospects",
      user: req.session,
    });
  }
});

// Export prospects to CSV (must come before :id route)
router.get("/prospects/export", (req, res) => {
  try {
    const { campaign, source, status, search } = req.query;

    let query = `
      SELECT DISTINCT
        p.*,
        GROUP_CONCAT(DISTINCT e.email) as all_emails,
        GROUP_CONCAT(DISTINCT e.source_page) as contact_pages
      FROM prospects p
      LEFT JOIN leads l ON p.id = l.prospect_id
      LEFT JOIN campaigns c ON l.campaign_id = c.id
      LEFT JOIN emails e ON p.id = e.prospect_id
      WHERE 1=1
    `;
    const params = [];

    if (campaign) {
      query += " AND l.campaign_id = ?";
      params.push(campaign);
    }

    if (source) {
      query += " AND p.last_source_type = ?";
      params.push(source);
    }

    if (status) {
      if (status === "with_emails") {
        query += " AND p.emails_extracted = 1";
      } else if (status === "without_emails") {
        query += " AND p.emails_extracted = 0";
      }
    }

    if (search) {
      query += " AND (p.company_name LIKE ? OR p.domain LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    query += " GROUP BY p.id ORDER BY p.created_at DESC";

    const prospects = db.prepare(query).all(...params);

    // Generate CSV
    const csvHeaders = "Company Name,Home Page,Contact Page,Contact Email\n";
    const csvRows = prospects
      .map((p) => {
        const companyName = (p.company_name || "").replace(/"/g, '""');
        const homePage = p.website_url || `https://${p.domain}`;
        const contactPage =
          (p.contact_pages || "")
            .split(",")
            .map((cp) => cp.trim())
            .filter((cp) => cp)
            .shift() || "";
        const contactEmail =
          (p.all_emails || "")
            .split(",")
            .map((em) => em.trim())
            .filter((em) => em)
            .shift() || "";

        return `"${companyName}","${homePage}","${contactPage}","${contactEmail}"`;
      })
      .join("\n");

    const csv = csvHeaders + csvRows;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="prospects-export-${
        new Date().toISOString().split("T")[0]
      }.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error("Error exporting prospects:", error);
    res.status(500).render("error", {
      error: "Failed to export prospects: " + error.message,
      user: req.session,
    });
  }
});

// Add new prospect (manual) - must come before :id route
router.get("/prospects/new", (req, res) => {
  try {
    const campaigns = db
      .prepare("SELECT id, name FROM campaigns ORDER BY name")
      .all();
    res.render("prospects/form", {
      prospect: null,
      campaigns,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading form:", error);
    res
      .status(500)
      .render("error", { error: "Failed to load form", user: req.session });
  }
});

// Create new prospect
router.post("/prospects/new", (req, res) => {
  try {
    const { domain, company_name, website_url, city, country, campaign_id } =
      req.body;

    if (!domain) {
      return res
        .status(400)
        .render("error", { error: "Domain is required", user: req.session });
    }

    // Check if prospect already exists
    const existing = db
      .prepare("SELECT * FROM prospects WHERE domain = ?")
      .get(domain);
    if (existing) {
      return res.status(400).render("error", {
        error: "Prospect with this domain already exists",
        user: req.session,
      });
    }

    // Create prospect
    const stmt = db.prepare(`
      INSERT INTO prospects (domain, company_name, website_url, city, country)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      domain,
      company_name || null,
      website_url || null,
      city || null,
      country || null
    );

    const prospectId = result.lastInsertRowid;

    // If campaign is selected, create lead
    if (campaign_id) {
      const campaign = db
        .prepare("SELECT * FROM campaigns WHERE id = ?")
        .get(campaign_id);
      if (campaign) {
        db.prepare(
          `
          INSERT INTO leads (brand_id, campaign_id, prospect_id, source_type, source_query)
          VALUES (?, ?, ?, 'other', 'manual-add')
        `
        ).run(campaign.brand_id, campaign_id, prospectId);
      }
    }

    res.redirect(`/prospects/${prospectId}`);
  } catch (error) {
    console.error("Error creating prospect:", error);
    res.status(500).render("error", {
      error: "Failed to create prospect: " + error.message,
      user: req.session,
    });
  }
});

// Edit prospect - must come before :id route
router.get("/prospects/:id/edit", (req, res) => {
  try {
    const prospect = db
      .prepare("SELECT * FROM prospects WHERE id = ?")
      .get(req.params.id);
    if (!prospect) {
      return res
        .status(404)
        .render("error", { error: "Prospect not found", user: req.session });
    }

    const campaigns = db
      .prepare("SELECT id, name FROM campaigns ORDER BY name")
      .all();
    res.render("prospects/form", {
      prospect,
      campaigns,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading edit form:", error);
    res
      .status(500)
      .render("error", { error: "Failed to load form", user: req.session });
  }
});

// View prospect details
router.get("/prospects/:id", (req, res) => {
  try {
    const prospect = db
      .prepare(
        `
      SELECT * FROM prospects WHERE id = ?
    `
      )
      .get(req.params.id);

    if (!prospect) {
      return res
        .status(404)
        .render("error", { error: "Prospect not found", user: req.session });
    }

    // Get emails
    const emails = db
      .prepare(
        `
      SELECT * FROM emails WHERE prospect_id = ?
    `
      )
      .all(prospect.id);

    // Get leads (campaign associations)
    const leads = db
      .prepare(
        `
      SELECT
        l.*,
        c.name as campaign_name,
        b.name as brand_name
      FROM leads l
      JOIN campaigns c ON l.campaign_id = c.id
      JOIN brands b ON c.brand_id = b.id
      WHERE l.prospect_id = ?
      ORDER BY l.found_at DESC
    `
      )
      .all(prospect.id);

    // Get active templates for queueing
    const templates = db
      .prepare(
        "SELECT id, name FROM email_templates WHERE is_active = 1 ORDER BY name"
      )
      .all();

    res.render("prospects/detail", {
      prospect,
      emails,
      leads,
      templates,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading prospect details:", error);
    res.status(500).render("error", {
      error: "Failed to load prospect details",
      user: req.session,
    });
  }
});

// Update prospect status
router.post("/prospects/:id/update", (req, res) => {
  try {
    const { company_name, city, country } = req.body;
    const id = req.params.id;

    const stmt = db.prepare(`
      UPDATE prospects
      SET company_name = ?, city = ?, country = ?
      WHERE id = ?
    `);

    stmt.run(company_name, city || null, country || null, id);

    res.redirect(`/prospects/${id}`);
  } catch (error) {
    console.error("Error updating prospect:", error);
    res.status(500).render("error", {
      error: "Failed to update prospect: " + error.message,
      user: req.session,
    });
  }
});

// Delete prospect
router.post("/prospects/:id/delete", (req, res) => {
  try {
    const id = req.params.id;

    // Delete related records
    db.prepare("DELETE FROM leads WHERE prospect_id = ?").run(id);
    db.prepare("DELETE FROM emails WHERE prospect_id = ?").run(id);
    db.prepare("DELETE FROM prospects WHERE id = ?").run(id);

    res.redirect("/prospects");
  } catch (error) {
    console.error("Error deleting prospect:", error);
    res.status(500).render("error", {
      error: "Failed to delete prospect: " + error.message,
      user: req.session,
    });
  }
});

// Add to exclusion list
router.post("/prospects/:id/exclude", (req, res) => {
  try {
    const { reason } = req.body;
    const id = req.params.id;

    const prospect = db.prepare("SELECT * FROM prospects WHERE id = ?").get(id);

    if (prospect) {
      db.prepare(
        `
        INSERT OR IGNORE INTO exclusions (type, value, reason)
        VALUES ('domain', ?, ?)
      `
      ).run(prospect.domain, reason);
    }

    res.redirect("/prospects");
  } catch (error) {
    console.error("Error adding to exclusion:", error);
    res.status(500).render("error", {
      error: "Failed to add to exclusion: " + error.message,
      user: req.session,
    });
  }
});

// Blog prospects
router.get("/blog-prospects", (req, res) => {
  try {
    const { search, source } = req.query;

    let query = `
      SELECT
        bp.*,
        COUNT(DISTINCT be.id) as email_count
      FROM blog_prospects bp
      LEFT JOIN blog_emails be ON bp.id = be.blog_prospect_id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += " AND (bp.blog_name LIKE ? OR bp.domain LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    if (source) {
      query += " AND bp.last_source_type = ?";
      params.push(source);
    }

    query += " GROUP BY bp.id ORDER BY bp.created_at DESC LIMIT 500";

    const prospects = db.prepare(query).all(...params);

    res.render("prospects/blog-list", {
      prospects,
      filters: { search, source },
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading blog prospects:", error);
    res.status(500).render("error", {
      error: "Failed to load blog prospects",
      user: req.session,
    });
  }
});

// Export blog prospects to CSV
router.get("/blog-prospects/export", (req, res) => {
  try {
    const { search, source } = req.query;

    let query = `
      SELECT
        bp.*,
        GROUP_CONCAT(DISTINCT be.email) as all_emails,
        GROUP_CONCAT(DISTINCT be.source_page) as contact_pages
      FROM blog_prospects bp
      LEFT JOIN blog_emails be ON bp.id = be.blog_prospect_id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += " AND (bp.blog_name LIKE ? OR bp.domain LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    if (source) {
      query += " AND bp.last_source_type = ?";
      params.push(source);
    }

    query += " GROUP BY bp.id ORDER BY bp.created_at DESC";

    const prospects = db.prepare(query).all(...params);

    // Generate CSV
    const csvHeaders = "Company Name,Blog URL,Contact Page or Email\n";
    const csvRows = prospects
      .map((p) => {
        const companyName = (p.blog_name || "").replace(/"/g, '""');
        const blogUrl = p.website_url || `https://${p.domain}`;
        const contactPage =
          (p.contact_pages || "")
            .split(",")
            .map((cp) => cp.trim())
            .filter((cp) => cp)
            .shift() || "";
        const contactEmail =
          (p.all_emails || "")
            .split(",")
            .map((em) => em.trim())
            .filter((em) => em)
            .shift() || "";
        const contactInfo = contactPage || contactEmail;

        return `"${companyName}","${blogUrl}","${contactInfo}"`;
      })
      .join("\n");

    const csv = csvHeaders + csvRows;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="blog-prospects-export-${
        new Date().toISOString().split("T")[0]
      }.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error("Error exporting blog prospects:", error);
    res.status(500).render("error", {
      error: "Failed to export blog prospects: " + error.message,
      user: req.session,
    });
  }
});

// Add new blog prospect (manual) - must come before :id route
router.get("/blog-prospects/new", (req, res) => {
  try {
    const campaigns = db
      .prepare("SELECT id, name FROM campaigns ORDER BY name")
      .all();
    res.render("prospects/blog-form", {
      prospect: null,
      campaigns,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading form:", error);
    res
      .status(500)
      .render("error", { error: "Failed to load form", user: req.session });
  }
});

// Create new blog prospect
router.post("/blog-prospects/new", (req, res) => {
  try {
    const { domain, blog_name, website_url, campaign_id } = req.body;

    if (!domain) {
      return res
        .status(400)
        .render("error", { error: "Domain is required", user: req.session });
    }

    // Check if prospect already exists
    const existing = db
      .prepare("SELECT * FROM blog_prospects WHERE domain = ?")
      .get(domain);
    if (existing) {
      return res.status(400).render("error", {
        error: "Blog prospect with this domain already exists",
        user: req.session,
      });
    }

    // Create blog prospect
    const stmt = db.prepare(`
      INSERT INTO blog_prospects (domain, blog_name, website_url)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(domain, blog_name || null, website_url || null);

    const prospectId = result.lastInsertRowid;

    // If campaign is selected, create blog lead
    if (campaign_id) {
      const campaign = db
        .prepare("SELECT * FROM campaigns WHERE id = ?")
        .get(campaign_id);
      if (campaign) {
        db.prepare(
          `
          INSERT INTO blog_leads (brand_id, campaign_id, blog_prospect_id, source_type, source_query)
          VALUES (?, ?, ?, 'other', 'manual-add')
        `
        ).run(campaign.brand_id, campaign_id, prospectId);
      }
    }

    res.redirect(`/blog-prospects/${prospectId}`);
  } catch (error) {
    console.error("Error creating blog prospect:", error);
    res.status(500).render("error", {
      error: "Failed to create blog prospect: " + error.message,
      user: req.session,
    });
  }
});

// Edit blog prospect - must come before :id route
router.get("/blog-prospects/:id/edit", (req, res) => {
  try {
    const prospect = db
      .prepare("SELECT * FROM blog_prospects WHERE id = ?")
      .get(req.params.id);
    if (!prospect) {
      return res.status(404).render("error", {
        error: "Blog prospect not found",
        user: req.session,
      });
    }

    const campaigns = db
      .prepare("SELECT id, name FROM campaigns ORDER BY name")
      .all();
    res.render("prospects/blog-form", {
      prospect,
      campaigns,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading edit form:", error);
    res
      .status(500)
      .render("error", { error: "Failed to load form", user: req.session });
  }
});

// Blog prospect details
router.get("/blog-prospects/:id", (req, res) => {
  try {
    const prospect = db
      .prepare(
        `
      SELECT * FROM blog_prospects WHERE id = ?
    `
      )
      .get(req.params.id);

    if (!prospect) {
      return res.status(404).render("error", {
        error: "Blog prospect not found",
        user: req.session,
      });
    }

    // Get emails
    const emails = db
      .prepare(
        `
      SELECT * FROM blog_emails WHERE blog_prospect_id = ?
    `
      )
      .all(prospect.id);

    // Get blog leads
    const leads = db
      .prepare(
        `
      SELECT
        bl.*,
        c.name as campaign_name,
        b.name as brand_name
      FROM blog_leads bl
      JOIN campaigns c ON bl.campaign_id = c.id
      JOIN brands b ON c.brand_id = b.id
      WHERE bl.blog_prospect_id = ?
      ORDER BY bl.found_at DESC
    `
      )
      .all(prospect.id);

    // Get all campaigns for the dropdown
    const allCampaigns = db
      .prepare(
        `
      SELECT c.id, c.name, b.name as brand_name
      FROM campaigns c
      JOIN brands b ON c.brand_id = b.id
      ORDER BY b.name, c.name
    `
      )
      .all();

    res.render("prospects/blog-detail", {
      prospect,
      emails,
      leads,
      allCampaigns,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading blog prospect details:", error);
    res.status(500).render("error", {
      error: "Failed to load blog prospect details",
      user: req.session,
    });
  }
});

// Add blog prospect to campaign
router.post("/blog-prospects/:id/add-to-campaign", (req, res) => {
  try {
    const prospectId = req.params.id;
    const { campaign_id, source_type } = req.body;

    if (!campaign_id) {
      return res
        .status(400)
        .render("error", { error: "Campaign is required", user: req.session });
    }

    // Check if prospect exists
    const prospect = db
      .prepare("SELECT * FROM blog_prospects WHERE id = ?")
      .get(prospectId);
    if (!prospect) {
      return res.status(404).render("error", {
        error: "Blog prospect not found",
        user: req.session,
      });
    }

    // Get campaign with brand info
    const campaign = db
      .prepare(
        `
      SELECT c.*, b.id as brand_id
      FROM campaigns c
      JOIN brands b ON c.brand_id = b.id
      WHERE c.id = ?
    `
      )
      .get(campaign_id);

    if (!campaign) {
      return res
        .status(404)
        .render("error", { error: "Campaign not found", user: req.session });
    }

    // Check if already exists
    const existing = db
      .prepare(
        `
      SELECT * FROM blog_leads
      WHERE campaign_id = ? AND blog_prospect_id = ?
    `
      )
      .get(campaign_id, prospectId);

    if (existing) {
      return res.redirect(`/blog-prospects/${prospectId}?error=already_added`);
    }

    // Create blog lead
    db.prepare(
      `
      INSERT INTO blog_leads (brand_id, campaign_id, blog_prospect_id, source_type, source_query)
      VALUES (?, ?, ?, ?, 'manual')
    `
    ).run(campaign.brand_id, campaign_id, prospectId, source_type || "other");

    res.redirect(`/blog-prospects/${prospectId}?success=added_to_campaign`);
  } catch (error) {
    console.error("Error adding to campaign:", error);
    res.status(500).render("error", {
      error: "Failed to add to campaign: " + error.message,
      user: req.session,
    });
  }
});

// Update blog prospect
router.post("/blog-prospects/:id/update", (req, res) => {
  try {
    const { blog_name, website_url } = req.body;
    const id = req.params.id;

    const stmt = db.prepare(`
      UPDATE blog_prospects
      SET blog_name = ?, website_url = ?
      WHERE id = ?
    `);

    stmt.run(blog_name || null, website_url || null, id);

    res.redirect(`/blog-prospects/${id}`);
  } catch (error) {
    console.error("Error updating blog prospect:", error);
    res.status(500).render("error", {
      error: "Failed to update blog prospect: " + error.message,
      user: req.session,
    });
  }
});

// Delete blog prospect
router.post("/blog-prospects/:id/delete", (req, res) => {
  try {
    const id = req.params.id;

    // Delete related records
    // 1. Delete text from email_queue where linked to this prospect's leads or emails
    db.prepare(
      "DELETE FROM email_queue WHERE blog_lead_id IN (SELECT id FROM blog_leads WHERE blog_prospect_id = ?)"
    ).run(id);
    db.prepare(
      "DELETE FROM email_queue WHERE blog_email_id IN (SELECT id FROM blog_emails WHERE blog_prospect_id = ?)"
    ).run(id);

    db.prepare("DELETE FROM blog_leads WHERE blog_prospect_id = ?").run(id);
    db.prepare("DELETE FROM blog_emails WHERE blog_prospect_id = ?").run(id);
    db.prepare("DELETE FROM blog_prospects WHERE id = ?").run(id);

    res.redirect("/blog-prospects");
  } catch (error) {
    console.error("Error deleting blog prospect:", error);
    res.status(500).render("error", {
      error: "Failed to delete blog prospect: " + error.message,
      user: req.session,
    });
  }
});

export default router;
