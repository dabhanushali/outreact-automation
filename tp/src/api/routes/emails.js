import express from "express";
import { db } from "../../database/db.js";

const router = express.Router();

// List all company emails
router.get("/emails", (req, res) => {
  try {
    const { campaign, domain_match, generic, search } = req.query;

    let query = `
      SELECT
        e.*,
        p.domain,
        p.company_name,
        c.name as campaign_name
      FROM emails e
      JOIN prospects p ON e.prospect_id = p.id
      LEFT JOIN leads l ON p.id = l.prospect_id
      LEFT JOIN campaigns c ON l.campaign_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (campaign) {
      query += " AND l.campaign_id = ?";
      params.push(campaign);
    }

    if (domain_match !== undefined && domain_match !== "") {
      query += " AND e.is_domain_match = ?";
      params.push(domain_match === "true" ? 1 : 0);
    }

    if (generic !== undefined && generic !== "") {
      query += " AND e.is_generic = ?";
      params.push(generic === "true" ? 1 : 0);
    }

    if (search) {
      query += " AND e.email LIKE ?";
      params.push(`%${search}%`);
    }

    query += " ORDER BY e.created_at DESC LIMIT 500";

    const emails = db.prepare(query).all(...params);

    // Get filter options
    const campaigns = db
      .prepare("SELECT id, name FROM campaigns ORDER BY name")
      .all();

    res.render("emails/list", {
      emails,
      campaigns,
      filters: { campaign, domain_match, generic, search },
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading emails:", error);
    res
      .status(500)
      .render("error", { error: "Failed to load emails", user: req.session });
  }
});

// List all blog emails
router.get("/blog-emails", (req, res) => {
  try {
    const { search, domain_match, generic, campaign } = req.query;

    let query = `
      SELECT
        be.*,
        bp.domain,
        bp.blog_name
      FROM blog_emails be
      JOIN blog_prospects bp ON be.blog_prospect_id = bp.id
      WHERE 1=1
    `;
    const params = [];

    if (domain_match !== undefined && domain_match !== "") {
      query += " AND be.is_domain_match = ?";
      params.push(domain_match === "true" ? 1 : 0);
    }

    if (generic !== undefined && generic !== "") {
      query += " AND be.is_generic = ?";
      params.push(generic === "true" ? 1 : 0);
    }

    if (search) {
      query += " AND be.email LIKE ?";
      params.push(`%${search}%`);
    }

    // Campaign filter - join with blog_leads
    if (campaign) {
      query += ` AND EXISTS (
        SELECT 1 FROM blog_leads bl
        WHERE bl.blog_prospect_id = bp.id AND bl.blog_email_id = be.id AND bl.campaign_id = ?
      )`;
      params.push(campaign);
    }

    query += " ORDER BY be.created_at DESC LIMIT 500";

    const emails = db.prepare(query).all(...params);

    // Get campaigns for filter dropdown
    const campaigns = db.prepare("SELECT id, name FROM campaigns ORDER BY name").all();

    res.render("emails/blog-list", {
      emails,
      campaigns,
      filters: { search, domain_match, generic, campaign },
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading blog emails:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to load blog emails",
        user: req.session,
      });
  }
});

// Export company emails to CSV (must come before :id route)
router.get("/emails/export", (req, res) => {
  try {
    const { campaign, domain_match, generic, search } = req.query;

    let query = `
      SELECT
        e.email
      FROM emails e
      JOIN prospects p ON e.prospect_id = p.id
      LEFT JOIN leads l ON p.id = l.prospect_id
      LEFT JOIN campaigns c ON l.campaign_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (campaign) {
      query += " AND l.campaign_id = ?";
      params.push(campaign);
    }

    if (domain_match !== undefined && domain_match !== "") {
      query += " AND e.is_domain_match = ?";
      params.push(domain_match === "true" ? 1 : 0);
    }

    if (generic !== undefined && generic !== "") {
      query += " AND e.is_generic = ?";
      params.push(generic === "true" ? 1 : 0);
    }

    if (search) {
      query += " AND e.email LIKE ?";
      params.push(`%${search}%`);
    }

    query += " ORDER BY e.email ASC";

    const emails = db.prepare(query).all(...params);

    // Generate CSV - just email addresses
    const csvHeaders = "Email\n";
    const csvRows = emails.map((e) => `"${e.email}"`).join("\n");

    const csv = csvHeaders + csvRows;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="company-emails-${
        new Date().toISOString().split("T")[0]
      }.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error("Error exporting emails:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to export emails: " + error.message,
        user: req.session,
      });
  }
});

// Export blog emails to CSV (must come before :id route)
router.get("/blog-emails/export", (req, res) => {
  try {
    const { search, domain_match, generic, campaign } = req.query;

    let query = `
      SELECT
        be.email
      FROM blog_emails be
      JOIN blog_prospects bp ON be.blog_prospect_id = bp.id
      WHERE 1=1
    `;
    const params = [];

    if (domain_match !== undefined && domain_match !== "") {
      query += " AND be.is_domain_match = ?";
      params.push(domain_match === "true" ? 1 : 0);
    }

    if (generic !== undefined && generic !== "") {
      query += " AND be.is_generic = ?";
      params.push(generic === "true" ? 1 : 0);
    }

    if (search) {
      query += " AND be.email LIKE ?";
      params.push(`%${search}%`);
    }

    // Campaign filter - join with blog_leads
    if (campaign) {
      query += ` AND EXISTS (
        SELECT 1 FROM blog_leads bl
        WHERE bl.blog_prospect_id = bp.id AND bl.blog_email_id = be.id AND bl.campaign_id = ?
      )`;
      params.push(campaign);
    }

    query += " ORDER BY be.email ASC";

    const emails = db.prepare(query).all(...params);

    // Generate CSV - just email addresses
    const csvHeaders = "Email\n";
    const csvRows = emails.map((e) => `"${e.email}"`).join("\n");

    const csv = csvHeaders + csvRows;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="blog-emails-${
        new Date().toISOString().split("T")[0]
      }.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error("Error exporting blog emails:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to export blog emails: " + error.message,
        user: req.session,
      });
  }
});

// Add new email to prospect (must come before :id route)
router.get("/emails/new", (req, res) => {
  try {
    const { prospect_id } = req.query;

    if (!prospect_id) {
      // Show prospects selection
      const prospects = db
        .prepare(
          `
        SELECT id, domain, company_name
        FROM prospects
        ORDER BY domain
        LIMIT 100
      `
        )
        .all();

      return res.render("emails/select-prospect", {
        prospects,
        user: req.session,
      });
    }

    const prospect = db
      .prepare("SELECT * FROM prospects WHERE id = ?")
      .get(prospect_id);

    if (!prospect) {
      return res
        .status(404)
        .render("error", { error: "Prospect not found", user: req.session });
    }

    res.render("emails/form", {
      email: null,
      prospect,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading form:", error);
    res
      .status(500)
      .render("error", { error: "Failed to load form", user: req.session });
  }
});

// Create new email
router.post("/emails/new", (req, res) => {
  try {
    const {
      prospect_id,
      email,
      source_page,
      is_domain_match,
      is_generic,
      confidence,
    } = req.body;

    if (!prospect_id || !email) {
      return res
        .status(400)
        .render("error", {
          error: "Prospect and email are required",
          user: req.session,
        });
    }

    // Check if email already exists
    const existing = db
      .prepare("SELECT * FROM emails WHERE email = ?")
      .get(email);
    if (existing) {
      return res
        .status(400)
        .render("error", { error: "Email already exists", user: req.session });
    }

    // Create email
    const stmt = db.prepare(`
      INSERT INTO emails (prospect_id, email, source_page, is_domain_match, is_generic, confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      prospect_id,
      email,
      source_page || null,
      is_domain_match === "true" || is_domain_match === true ? 1 : 0,
      is_generic === "true" || is_generic === true ? 1 : 0,
      confidence || 100
    );

    // Mark prospect as having emails
    db.prepare("UPDATE prospects SET emails_extracted = 1 WHERE id = ?").run(
      prospect_id
    );

    res.redirect(`/prospects/${prospect_id}`);
  } catch (error) {
    console.error("Error creating email:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to create email: " + error.message,
        user: req.session,
      });
  }
});

// Edit email (must come before :id route)
router.get("/emails/:id/edit", (req, res) => {
  try {
    const email = db
      .prepare(
        `
      SELECT e.*, p.domain, p.company_name
      FROM emails e
      JOIN prospects p ON e.prospect_id = p.id
      WHERE e.id = ?
    `
      )
      .get(req.params.id);

    if (!email) {
      return res
        .status(404)
        .render("error", { error: "Email not found", user: req.session });
    }

    const prospect = db
      .prepare("SELECT * FROM prospects WHERE id = ?")
      .get(email.prospect_id);

    res.render("emails/form", {
      email,
      prospect,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading email:", error);
    res
      .status(500)
      .render("error", { error: "Failed to load email", user: req.session });
  }
});

// View email details
router.get("/emails/:id", (req, res) => {
  try {
    const email = db
      .prepare(
        `
      SELECT
        e.*,
        p.domain,
        p.company_name,
        p.city,
        p.country
      FROM emails e
      JOIN prospects p ON e.prospect_id = p.id
      WHERE e.id = ?
    `
      )
      .get(req.params.id);

    if (!email) {
      return res
        .status(404)
        .render("error", { error: "Email not found", user: req.session });
    }

    // Get campaigns this email is associated with
    const campaigns = db
      .prepare(
        `
      SELECT
        c.name as campaign_name,
        b.name as brand_name,
        l.status
      FROM leads l
      JOIN campaigns c ON l.campaign_id = c.id
      JOIN brands b ON c.brand_id = b.id
      WHERE l.prospect_id = ?
    `
      )
      .all(email.prospect_id);

    res.render("emails/detail", {
      email,
      campaigns,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading email details:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to load email details",
        user: req.session,
      });
  }
});

// Update email
router.post("/emails/:id/update", (req, res) => {
  try {
    const { email, is_domain_match, is_generic, confidence } = req.body;
    const id = req.params.id;

    const stmt = db.prepare(`
      UPDATE emails
      SET email = ?,
          is_domain_match = ?,
          is_generic = ?,
          confidence = ?
      WHERE id = ?
    `);

    stmt.run(
      email,
      is_domain_match ? 1 : 0,
      is_generic ? 1 : 0,
      confidence || 100,
      id
    );

    res.redirect(`/emails/${id}`);
  } catch (error) {
    console.error("Error updating email:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to update email: " + error.message,
        user: req.session,
      });
  }
});

// Delete email
router.post("/emails/:id/delete", (req, res) => {
  try {
    const id = req.params.id;

    // Delete in proper order to respect foreign keys
    // 1. Delete from email_queue
    db.prepare("DELETE FROM email_queue WHERE email_id = ?").run(id);

    // 2. Delete from outreach_logs
    db.prepare("DELETE FROM outreach_logs WHERE email_id = ?").run(id);

    // 3. Then delete the email
    db.prepare("DELETE FROM emails WHERE id = ?").run(id);

    res.redirect("/emails");
  } catch (error) {
    console.error("Error deleting email:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to delete email: " + error.message,
        user: req.session,
      });
  }
});

// ============ BLOG EMAILS ============

// Add new blog email (must come before :id route)
router.get("/blog-emails/new", (req, res) => {
  try {
    const { blog_prospect_id } = req.query;

    if (!blog_prospect_id) {
      // Show blog prospects selection
      const prospects = db
        .prepare(
          `
        SELECT id, domain, blog_name
        FROM blog_prospects
        ORDER BY domain
        LIMIT 100
      `
        )
        .all();

      return res.render("emails/select-blog-prospect", {
        prospects,
        user: req.session,
      });
    }

    const prospect = db
      .prepare("SELECT * FROM blog_prospects WHERE id = ?")
      .get(blog_prospect_id);

    if (!prospect) {
      return res
        .status(404)
        .render("error", {
          error: "Blog prospect not found",
          user: req.session,
        });
    }

    res.render("emails/blog-form", {
      email: null,
      prospect,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading form:", error);
    res
      .status(500)
      .render("error", { error: "Failed to load form", user: req.session });
  }
});

// Create new blog email
router.post("/blog-emails/new", (req, res) => {
  try {
    const {
      blog_prospect_id,
      email,
      source_page,
      is_domain_match,
      is_generic,
      confidence,
    } = req.body;

    if (!blog_prospect_id || !email) {
      return res
        .status(400)
        .render("error", {
          error: "Prospect and email are required",
          user: req.session,
        });
    }

    // Check if email already exists
    const existing = db
      .prepare("SELECT * FROM blog_emails WHERE email = ?")
      .get(email);
    if (existing) {
      return res
        .status(400)
        .render("error", { error: "Email already exists", user: req.session });
    }

    // Create blog email
    const stmt = db.prepare(`
      INSERT INTO blog_emails (blog_prospect_id, email, source_page, is_domain_match, is_generic, confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      blog_prospect_id,
      email,
      source_page || null,
      is_domain_match === "true" || is_domain_match === true ? 1 : 0,
      is_generic === "true" || is_generic === true ? 1 : 0,
      confidence || 100
    );

    // Mark prospect as having emails
    db.prepare(
      "UPDATE blog_prospects SET emails_extracted = 1 WHERE id = ?"
    ).run(blog_prospect_id);

    res.redirect(`/blog-prospects/${blog_prospect_id}`);
  } catch (error) {
    console.error("Error creating blog email:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to create blog email: " + error.message,
        user: req.session,
      });
  }
});

// Edit blog email
router.get("/blog-emails/:id/edit", (req, res) => {
  try {
    const email = db
      .prepare(
        `
      SELECT be.*, bp.domain, bp.blog_name
      FROM blog_emails be
      JOIN blog_prospects bp ON be.blog_prospect_id = bp.id
      WHERE be.id = ?
    `
      )
      .get(req.params.id);

    if (!email) {
      return res
        .status(404)
        .render("error", { error: "Blog email not found", user: req.session });
    }

    const prospect = db
      .prepare("SELECT * FROM blog_prospects WHERE id = ?")
      .get(email.blog_prospect_id);

    res.render("emails/blog-form", {
      email,
      prospect,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading blog email:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to load blog email",
        user: req.session,
      });
  }
});

// View blog email details
router.get("/blog-emails/:id", (req, res) => {
  try {
    const email = db
      .prepare(
        `
      SELECT
        be.*,
        bp.domain,
        bp.blog_name
      FROM blog_emails be
      JOIN blog_prospects bp ON be.blog_prospect_id = bp.id
      WHERE be.id = ?
    `
      )
      .get(req.params.id);

    if (!email) {
      return res
        .status(404)
        .render("error", { error: "Blog email not found", user: req.session });
    }

    // Get campaigns this blog email is associated with
    const campaigns = db
      .prepare(
        `
      SELECT
        c.name as campaign_name,
        b.name as brand_name,
        bl.status
      FROM blog_leads bl
      JOIN campaigns c ON bl.campaign_id = c.id
      JOIN brands b ON c.brand_id = b.id
      WHERE bl.blog_prospect_id = ?
    `
      )
      .all(email.blog_prospect_id);

    res.render("emails/blog-detail", {
      email,
      campaigns,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading blog email details:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to load blog email details",
        user: req.session,
      });
  }
});

// Update blog email
// Update blog email
router.post("/blog-emails/:id/update", (req, res) => {
  try {
    const { email, is_domain_match, is_generic, confidence } = req.body;
    const id = req.params.id;

    // Check if email already exists for another record
    const existing = db
      .prepare("SELECT id FROM blog_emails WHERE email = ? AND id != ?")
      .get(email, id);
    if (existing) {
      // Get prospect for redirect
      const current = db
        .prepare("SELECT blog_prospect_id FROM blog_emails WHERE id = ?")
        .get(id);
      return res.status(400).render("error", {
        error: "Email address already exists for another contact",
        user: req.session,
        backUrl: current
          ? `/blog-prospects/${current.blog_prospect_id}`
          : "/blog-emails",
      });
    }

    const stmt = db.prepare(`
      UPDATE blog_emails
      SET email = ?,
          is_domain_match = ?,
          is_generic = ?,
          confidence = ?
      WHERE id = ?
    `);

    stmt.run(
      email,
      is_domain_match === "true" || is_domain_match === true ? 1 : 0,
      is_generic === "true" || is_generic === true ? 1 : 0,
      confidence || 100,
      id
    );

    // Redirect to blog prospect page
    const emailRecord = db
      .prepare("SELECT blog_prospect_id FROM blog_emails WHERE id = ?")
      .get(id);
    if (emailRecord) {
      res.redirect(`/blog-prospects/${emailRecord.blog_prospect_id}`);
    } else {
      res.redirect("/blog-emails");
    }
  } catch (error) {
    console.error("Error updating blog email:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to update blog email: " + error.message,
        user: req.session,
      });
  }
});

// Delete blog email
router.post("/blog-emails/:id/delete", (req, res) => {
  try {
    const id = req.params.id;

    // Get blog_prospect_id before deleting
    const emailRecord = db
      .prepare("SELECT blog_prospect_id FROM blog_emails WHERE id = ?")
      .get(id);

    // Delete in proper order to respect foreign keys
    // 1. Delete from email_queue
    db.prepare("DELETE FROM email_queue WHERE blog_email_id = ?").run(id);

    // 2. Delete from outreach_logs
    db.prepare("DELETE FROM outreach_logs WHERE blog_email_id = ?").run(id);

    // 3. Delete the blog email
    db.prepare("DELETE FROM blog_emails WHERE id = ?").run(id);

    if (emailRecord) {
      res.redirect(`/blog-prospects/${emailRecord.blog_prospect_id}`);
    } else {
      res.redirect("/blog-emails");
    }
  } catch (error) {
    console.error("Error deleting blog email:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to delete blog email: " + error.message,
        user: req.session,
      });
  }
});

export default router;
