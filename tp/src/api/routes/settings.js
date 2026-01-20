import express from "express";
import { db } from "../../database/db.js";
import { DailyLimitService } from "../../services/DailyLimitService.js";
import { BrandRepo } from "../../repositories/BrandRepo.js";
import FollowUpService from "../../services/FollowUpService.js";

const router = express.Router();

// Brands management
router.get("/settings/brands", (req, res) => {
  try {
    const brands = BrandRepo.getAll();

    // Get campaign count for each brand
    brands.forEach((brand) => {
      const count = BrandRepo.getCampaignCount(brand.id);
      brand.campaign_count = count.count;
    });

    res.render("settings/brands", { brands, user: req.session });
  } catch (error) {
    console.error("Error loading brands:", error);
    res
      .status(500)
      .render("error", { error: "Failed to load brands", user: req.session });
  }
});

// View brand details/edit
router.get("/settings/brands/:id/edit", (req, res) => {
  try {
    const brand = BrandRepo.getById(req.params.id);
    if (!brand) {
      return res.status(404).render("error", {
        error: "Brand not found",
        user: req.session,
      });
    }

    const campaignCount = BrandRepo.getCampaignCount(brand.id);

    res.render("settings/brand-form", {
      brand,
      campaignCount,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading brand:", error);
    res.status(500).render("error", {
      error: "Failed to load brand: " + error.message,
      user: req.session,
    });
  }
});

// Create brand
router.post("/settings/brands", (req, res) => {
  try {
    const { name, website } = req.body;

    const id = db.prepare("INSERT INTO brands (name, website) VALUES (?, ?)").run(
      name,
      website || null
    ).lastInsertRowid;

    res.redirect("/settings/brands");
  } catch (error) {
    console.error("Error creating brand:", error);
    res.status(500).render("error", {
      error: "Failed to create brand: " + error.message,
      user: req.session,
    });
  }
});

// Update brand
router.post("/settings/brands/:id", (req, res) => {
  try {
    const id = req.params.id;
    const {
      name,
      website,
      smtp_host,
      smtp_port,
      smtp_secure,
      smtp_user,
      smtp_password,
      smtp_from_name,
      smtp_from_email,
      smtp_is_active
    } = req.body;

    const brand = BrandRepo.update(id, {
      name,
      website,
      smtp_host: smtp_host || null,
      smtp_port: smtp_port ? parseInt(smtp_port) : null,
      smtp_secure: smtp_secure === "true" || smtp_secure === true || smtp_secure === 1,
      smtp_user: smtp_user || null,
      smtp_password: smtp_password || null,
      smtp_from_name: smtp_from_name || null,
      smtp_from_email: smtp_from_email || null,
      smtp_is_active: smtp_is_active === "true" || smtp_is_active === true || smtp_is_active === 1,
    });

    res.redirect("/settings/brands");
  } catch (error) {
    console.error("Error updating brand:", error);
    res.status(500).render("error", {
      error: "Failed to update brand: " + error.message,
      user: req.session,
    });
  }
});

// Test SMTP connection
router.post("/settings/brands/:id/test", (req, res) => {
  try {
    const result = BrandRepo.testConnection(req.params.id);
    res.json(result);
  } catch (error) {
    console.error("Error testing SMTP:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete brand
router.post("/settings/brands/:id/delete", (req, res) => {
  try {
    const id = req.params.id;
    const result = BrandRepo.delete(id);

    if (!result.success) {
      return res.status(400).render("error", {
        error: result.error,
        user: req.session,
      });
    }

    res.redirect("/settings/brands");
  } catch (error) {
    console.error("Error deleting brand:", error);
    res.status(500).render("error", {
      error: "Failed to delete brand: " + error.message,
      user: req.session,
    });
  }
});

// Daily limits
router.get("/settings/daily-limits", (req, res) => {
  try {
    const limits = db
      .prepare(
        `
      SELECT * FROM daily_limits
      ORDER BY date DESC
      LIMIT 30
    `
      )
      .all();

    const limitSettings = DailyLimitService.getAllLimits();

    res.render("settings/daily-limits", {
      limits,
      limitSettings,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading daily limits:", error);
    res.status(500).render("error", {
      error: "Failed to load daily limits",
      user: req.session,
    });
  }
});

// Update today's limits
router.post("/settings/daily-limits/update", (req, res) => {
  try {
    const {
      date,
      prospects_added,
      emails_found,
      blog_assets_found,
      outreach_sent,
    } = req.body;

    db.prepare(
      `
      INSERT OR REPLACE INTO daily_limits
      (date, prospects_added, emails_found, blog_assets_found, outreach_sent)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(
      date,
      prospects_added || 0,
      emails_found || 0,
      blog_assets_found || 0,
      outreach_sent || 0
    );

    res.redirect("/settings/daily-limits");
  } catch (error) {
    console.error("Error updating daily limits:", error);
    res.status(500).render("error", {
      error: "Failed to update daily limits: " + error.message,
      user: req.session,
    });
  }
});

// Update daily limit settings (thresholds)
router.post("/settings/daily-limits/settings", (req, res) => {
  try {
    const { prospect_limit, blog_limit, email_limit, outreach_limit } =
      req.body;

    DailyLimitService.updateLimits({
      prospect_limit: prospect_limit ? parseInt(prospect_limit) : undefined,
      blog_limit: blog_limit ? parseInt(blog_limit) : undefined,
      email_limit: email_limit ? parseInt(email_limit) : undefined,
      outreach_limit: outreach_limit ? parseInt(outreach_limit) : undefined,
    });

    res.redirect("/settings/daily-limits");
  } catch (error) {
    console.error("Error updating limit settings:", error);
    res.status(500).render("error", {
      error: "Failed to update limit settings: " + error.message,
      user: req.session,
    });
  }
});

// API: Get daily limit settings
router.get("/api/settings/daily-limits", (req, res) => {
  try {
    const limits = DailyLimitService.getAllLimits();
    const today = DailyLimitService.getTodayStats();

    res.json({
      success: true,
      settings: limits,
      today: today,
    });
  } catch (error) {
    console.error("Error getting daily limit settings:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Keywords management
router.get("/settings/keywords", (req, res) => {
  try {
    const keywords = db
      .prepare("SELECT * FROM outreach_keywords ORDER BY phrase")
      .all();

    res.render("settings/keywords", { keywords, user: req.session });
  } catch (error) {
    console.error("Error loading keywords:", error);
    res
      .status(500)
      .render("error", { error: "Failed to load keywords", user: req.session });
  }
});

// Add keyword
router.post("/settings/keywords", (req, res) => {
  try {
    const { phrase } = req.body;

    db.prepare("INSERT INTO outreach_keywords (phrase) VALUES (?)").run(phrase);

    res.redirect("/settings/keywords");
  } catch (error) {
    console.error("Error adding keyword:", error);
    res.status(500).render("error", {
      error: "Failed to add keyword: " + error.message,
      user: req.session,
    });
  }
});

// Delete keyword
router.post("/settings/keywords/:id/delete", (req, res) => {
  try {
    const id = req.params.id;

    db.prepare("DELETE FROM outreach_keywords WHERE id = ?").run(id);

    res.redirect("/settings/keywords");
  } catch (error) {
    console.error("Error deleting keyword:", error);
    res.status(500).render("error", {
      error: "Failed to delete keyword: " + error.message,
      user: req.session,
    });
  }
});

// Import keywords from CSV
router.post("/settings/keywords/import-csv", async (req, res) => {
  try {
    const { csv_url } = req.body;

    if (!csv_url) {
      return res.status(400).render("error", {
        error: "CSV URL is required",
        user: req.session,
      });
    }

    console.log(`Importing keywords from: ${csv_url}`);

    let targetUrl = csv_url;
    // Auto-fix Google Sheet edit URLs to export CSV format
    if (
      targetUrl.includes("docs.google.com/spreadsheets") &&
      targetUrl.includes("/edit")
    ) {
      targetUrl = targetUrl.replace(/\/edit.*$/, "/export?format=csv");
      console.log(`Auto-corrected Google Sheet URL to: ${targetUrl}`);
    }

    // Fetch CSV
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch sheet: ${response.status} ${response.statusText}`
      );
    }
    const csvText = await response.text();

    // Check for HTML content (common when sheet is not public)
    if (csvText.includes("<!DOCTYPE html") || csvText.includes("<html")) {
      return res.status(400).render("error", {
        error:
          'Invalid CSV: The link returned a webpage instead of a CSV. Please make sure the Google Sheet is "Published to the Web" (File > Share > Publish to web) or visible to anyone with the link.',
        user: req.session,
      });
    }

    const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length === 0) {
      return res.redirect("/settings/keywords?error=empty_sheet");
    }

    // Determine column index from header
    const headers = lines[0]
      .split(",")
      .map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());

    let keywordCol = headers.indexOf("keyword");
    if (keywordCol === -1) keywordCol = headers.indexOf("phrase");

    console.log(`Import Debug: Headers: [${headers.join(", ")}]`);

    if (keywordCol === -1) {
      return res.status(400).render("error", {
        error: "CSV must have a 'Keyword' or 'Phrase' column",
        user: req.session,
      });
    }

    let added = 0;
    let skipped = 0;

    db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i]
          .split(",")
          .map((c) => c.trim().replace(/^"|"$/g, ""));

        const phrase = cols[keywordCol];

        if (!phrase || phrase.length === 0) {
          skipped++;
          continue;
        }

        try {
          db.prepare("INSERT OR IGNORE INTO outreach_keywords (phrase) VALUES (?)").run(phrase);
          added++;
        } catch (err) {
          // Skip duplicates
          skipped++;
        }
      }
    })();

    console.log(`Import Result: Added ${added}, Skipped ${skipped}`);

    res.redirect(`/settings/keywords?success=imported_${added}`);
  } catch (error) {
    console.error("Error importing keywords:", error);
    res.status(500).render("error", {
      error: "Failed to import keywords: " + error.message,
      user: req.session,
    });
  }
});

// Search modifiers
router.get("/settings/modifiers", (req, res) => {
  try {
    const modifiers = db
      .prepare("SELECT * FROM search_modifiers ORDER BY category, modifier")
      .all();

    res.render("settings/modifiers", { modifiers, user: req.session });
  } catch (error) {
    console.error("Error loading modifiers:", error);
    res.status(500).render("error", {
      error: "Failed to load modifiers",
      user: req.session,
    });
  }
});

// Add modifier
router.post("/settings/modifiers", (req, res) => {
  try {
    const { category, modifier } = req.body;

    db.prepare(
      "INSERT INTO search_modifiers (category, modifier) VALUES (?, ?)"
    ).run(category, modifier);

    res.redirect("/settings/modifiers");
  } catch (error) {
    console.error("Error adding modifier:", error);
    res.status(500).render("error", {
      error: "Failed to add modifier: " + error.message,
      user: req.session,
    });
  }
});

// Delete modifier
router.post("/settings/modifiers/:id/delete", (req, res) => {
  try {
    const id = req.params.id;

    db.prepare("DELETE FROM search_modifiers WHERE id = ?").run(id);

    res.redirect("/settings/modifiers");
  } catch (error) {
    console.error("Error deleting modifier:", error);
    res.status(500).render("error", {
      error: "Failed to delete modifier: " + error.message,
      user: req.session,
    });
  }
});

// Exclusions management
router.get("/settings/exclusions", (req, res) => {
  try {
    const { type, search } = req.query;

    let query = "SELECT * FROM exclusions WHERE 1=1";
    const params = [];

    if (type) {
      query += " AND type = ?";
      params.push(type);
    }

    if (search) {
      query += " AND value LIKE ?";
      params.push(`%${search}%`);
    }

    query += " ORDER BY added_at DESC LIMIT 500";

    const exclusions = db.prepare(query).all(...params);

    res.render("settings/exclusions", {
      exclusions,
      filters: { type, search },
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading exclusions:", error);
    res.status(500).render("error", {
      error: "Failed to load exclusions",
      user: req.session,
    });
  }
});

// Add exclusion
router.post("/settings/exclusions", (req, res) => {
  try {
    const { type, value, reason } = req.body;

    db.prepare(
      "INSERT INTO exclusions (type, value, reason) VALUES (?, ?, ?)"
    ).run(type, value, reason || null);

    res.redirect("/settings/exclusions");
  } catch (error) {
    console.error("Error adding exclusion:", error);
    res.status(500).render("error", {
      error: "Failed to add exclusion: " + error.message,
      user: req.session,
    });
  }
});

// Import exclusions from Google Sheet
router.post("/settings/exclusions/import-sheet", async (req, res) => {
  try {
    const { csv_url } = req.body;

    if (!csv_url) {
      return res
        .status(400)
        .render("error", { error: "CSV URL is required", user: req.session });
    }

    console.log(`Importing exclusions from: ${csv_url}`);

    let targetUrl = csv_url;
    // Auto-fix Google Sheet edit URLs to export CSV format
    if (
      targetUrl.includes("docs.google.com/spreadsheets") &&
      targetUrl.includes("/edit")
    ) {
      targetUrl = targetUrl.replace(/\/edit.*$/, "/export?format=csv");
      console.log(`Auto-corrected Google Sheet URL to: ${targetUrl}`);
    }

    // Fetch CSV
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch sheet: ${response.status} ${response.statusText}`
      );
    }
    const csvText = await response.text();

    // Check for HTML content (common when sheet is not public)
    if (csvText.includes("<!DOCTYPE html") || csvText.includes("<html")) {
      return res.status(400).render("error", {
        error:
          'Invalid CSV: The link returned a webpage instead of a CSV. Please make sure the Google Sheet is "Published to the Web" (File > Share > Publish to web) or visible to anyone with the link.',
        user: req.session,
      });
    }

    const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length === 0) {
      return res.redirect("/settings/exclusions?error=empty_sheet");
    }

    // Determine column index (assume first column "Domain" or just use first column)
    const headers = lines[0]
      .split(",")
      .map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
    let domainColIndex = headers.indexOf("domain");

    console.log(
      `Import Debug: Found ${lines.length} lines. Headers: [${headers.join(
        ", "
      )}]`
    );

    let startIndex = 1; // skip header
    if (domainColIndex === -1) {
      console.log(
        'Import Debug: "domain" column not found, defaulting to column 0'
      );
      domainColIndex = 0; // fallback to first column
    } else {
      console.log(`Import Debug: Found "domain" at column ${domainColIndex}`);
    }

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO exclusions (type, value, reason)
      VALUES ('domain', ?, 'Imported from Sheet')
    `);

    let added = 0;
    let skipped = 0;

    db.transaction(() => {
      // Clear previous potentially bad imports if requested? No, that's dangerous.

      for (let i = startIndex; i < lines.length; i++) {
        const cols = lines[i]
          .split(",")
          .map((c) => c.trim().replace(/^"|"$/g, ""));
        let domain = cols[domainColIndex];

        if (domain) {
          // Clean domain
          const original = domain;
          domain = domain
            .replace(/^(https?:\/\/)?(www\.)?/, "")
            .replace(/\/$/, "")
            .replace(/\/.*$/, "") // Remove path if present
            .trim()
            .toLowerCase();

          // Strict Domain Validation
          // Must contain at least one dot, no spaces, no special chars except - . and _
          // And common logic to reject JS code often found in Google login pages
          const isValid =
            /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) &&
            !domain.includes(" ") &&
            !domain.includes("(") &&
            !domain.includes("=");

          if (isValid) {
            const info = stmt.run(domain);
            if (info.changes > 0) added++;
          } else {
            if (skipped < 5) {
              console.log(
                `Import Debug: Skipped invalid: "${domain}" (Original: "${original}")`
              );
            }
            skipped++;
          }
        }
      }
    })();

    console.log(`Import Result: Added ${added}, Skipped ${skipped}`);

    res.redirect(`/settings/exclusions?success=imported_${added}`);
  } catch (error) {
    console.error("Error importing exclusions:", error);
    res.status(500).render("error", {
      error: "Failed to import exclusions: " + error.message,
      user: req.session,
    });
  }
});

// Delete exclusion
router.post("/settings/exclusions/:id/delete", (req, res) => {
  try {
    const id = req.params.id;

    db.prepare("DELETE FROM exclusions WHERE id = ?").run(id);

    res.redirect("/settings/exclusions");
  } catch (error) {
    console.error("Error deleting exclusion:", error);
    res.status(500).render("error", {
      error: "Failed to delete exclusion: " + error.message,
      user: req.session,
    });
  }
});

// Geographic targeting
router.get("/settings/geo", (req, res) => {
  try {
    const countries = db
      .prepare(
        `
      SELECT
        c.*,
        COUNT(DISTINCT ci.id) as city_count
      FROM countries c
      LEFT JOIN cities ci ON c.id = ci.country_id
      GROUP BY c.id
      ORDER BY c.name
    `
      )
      .all();

    const cities = db
      .prepare(
        `
      SELECT
        ci.*,
        co.name as country_name
      FROM cities ci
      JOIN countries co ON ci.country_id = co.id
      ORDER BY co.name, ci.name
      LIMIT 500
    `
      )
      .all();

    res.render("settings/geo", { countries, cities, user: req.session });
  } catch (error) {
    console.error("Error loading geo settings:", error);
    res.status(500).render("error", {
      error: "Failed to load geo settings",
      user: req.session,
    });
  }
});

// Add country
router.post("/settings/countries", (req, res) => {
  try {
    const { name } = req.body;

    db.prepare("INSERT INTO countries (name) VALUES (?)").run(name);

    res.redirect("/settings/geo");
  } catch (error) {
    console.error("Error adding country:", error);
    res.status(500).render("error", {
      error: "Failed to add country: " + error.message,
      user: req.session,
    });
  }
});

// Add city
router.post("/settings/cities", (req, res) => {
  try {
    const { country_id, name } = req.body;

    db.prepare("INSERT INTO cities (country_id, name) VALUES (?, ?)").run(
      country_id,
      name
    );

    res.redirect("/settings/geo");
  } catch (error) {
    console.error("Error adding city:", error);
    res.status(500).render("error", {
      error: "Failed to add city: " + error.message,
      user: req.session,
    });
  }
});

// Follow-up settings
router.get("/settings/followup", (req, res) => {
  try {
    const settings = FollowUpService.getAllSettings();
    const schedule = FollowUpService.getScheduleConfig();

    res.render("settings/followup", {
      settings,
      schedule,
      user: req.session,
      req: req, // Pass req for query parameter access
    });
  } catch (error) {
    console.error("Error loading follow-up settings:", error);
    res.status(500).render("error", {
      error: "Failed to load follow-up settings",
      user: req.session,
    });
  }
});

// Update follow-up settings
router.post("/settings/followup", (req, res) => {
  try {
    const {
      followup_1_interval_days,
      followup_2_interval_days,
      followup_3_interval_days,
      followup_4_interval_days,
      auto_schedule_followups,
    } = req.body;

    // Update follow-up intervals
    const newSchedule = {
      followup_1: parseInt(followup_1_interval_days),
      followup_2: parseInt(followup_2_interval_days),
      followup_3: parseInt(followup_3_interval_days),
      followup_4: parseInt(followup_4_interval_days),
    };

    FollowUpService.updateScheduleConfig(newSchedule);

    // Update auto-schedule setting
    if (auto_schedule_followups !== undefined) {
      db.prepare(`
        INSERT OR REPLACE INTO system_settings (key, value, description)
        VALUES ('auto_schedule_followups', ?, COALESCE((SELECT description FROM system_settings WHERE key = 'auto_schedule_followups'), ''))
      `).run(auto_schedule_followups === 'true' || auto_schedule_followups === true ? 'true' : 'false');
    }

    res.redirect("/settings/followup?success=updated");
  } catch (error) {
    console.error("Error updating follow-up settings:", error);
    res.status(500).render("error", {
      error: "Failed to update follow-up settings: " + error.message,
      user: req.session,
    });
  }
});

// API: Get follow-up schedule
router.get("/api/settings/followup", (req, res) => {
  try {
    const schedule = FollowUpService.getScheduleConfig();
    const settings = FollowUpService.getAllSettings();

    res.json({
      success: true,
      schedule,
      settings,
    });
  } catch (error) {
    console.error("Error getting follow-up settings:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
