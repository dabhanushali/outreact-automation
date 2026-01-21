import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import { db, initSchema } from "../database/db.js";
import { InputParser } from "../services/InputParser.js";
import { BrandRepo } from "../repositories/BrandRepo.js";
import { CampaignRepo } from "../repositories/CampaignRepo.js";

// Initialize database schema
console.log("Initializing database...");
initSchema();

// Parse input files (for brands/campaigns)
const docsDir = path.resolve("d:/OutReach/docs");
try {
  InputParser.parseBlogSpecific(
    path.join(docsDir, "blog-specific approach.md")
  );
  InputParser.parseGeneral(path.join(docsDir, "general approach.md"));
} catch (e) {
  console.log("Note: Input parsing skipped (files may not exist)");
}

// Ensure we have a brand and campaign (fallback)
let brandId = db.prepare("SELECT id FROM brands LIMIT 1").get()?.id;
let campaignId = db.prepare("SELECT id FROM campaigns LIMIT 1").get()?.id;

if (!brandId) {
  console.log("Creating default brand...");
  brandId = BrandRepo.findOrCreate("Outreach System", "https://example.com");
}

if (!campaignId) {
  console.log("Creating default campaign...");
  campaignId = CampaignRepo.create(brandId, "General Outreach", null, []);
}

console.log(
  `Database initialization complete. Brand ID: ${brandId}, Campaign ID: ${campaignId}\n`
);

// Process follow-ups automatically on server startup
import FollowUpService from "../services/FollowUpService.js";
console.log("🔄 Checking for pending follow-ups...");
FollowUpService.processPendingFollowUps().then(result => {
  console.log(`✅ Follow-up processing complete on startup\n`);
}).catch(err => {
  console.error(`❌ Error processing follow-ups on startup: ${err.message}\n`);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.ADMIN_PORT || 3000;

// Middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "outreach-admin-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    res.redirect("/login");
  }
}

// Import routes
import campaignsRouter from "./routes/campaigns.js";
import prospectsRouter from "./routes/prospects.js";
import emailsRouter from "./routes/emails.js";
import leadsRouter from "./routes/leads.js";
import settingsRouter from "./routes/settings.js";
import directoriesRouter from "./routes/directories.js";
import scriptsRouter from "./routes/scripts.js";
import emailOutreachRouter from "./routes/email-outreach.js";
import apiRouter from "./routes/api.js";

// Login routes
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

  if (password === adminPassword) {
    req.session.authenticated = true;
    res.redirect("/");
  } else {
    res.render("login", { error: "Invalid password" });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// Protected routes
app.use("/", requireAuth, campaignsRouter);
app.use("/", requireAuth, prospectsRouter);
app.use("/", requireAuth, emailsRouter);
app.use("/", requireAuth, leadsRouter);
app.use("/", requireAuth, settingsRouter);
app.use("/", requireAuth, directoriesRouter);
app.use("/", requireAuth, scriptsRouter);
app.use("/", requireAuth, emailOutreachRouter);
app.use("/api", requireAuth, apiRouter);

// Dashboard
app.get("/", requireAuth, (req, res) => {
  try {
    // Get today's date
    const today = new Date().toISOString().split("T")[0];

    // Overall stats
    const totalCampaigns = db
      .prepare("SELECT COUNT(*) as count FROM campaigns")
      .get().count;
    const totalProspects = db
      .prepare("SELECT COUNT(*) as count FROM prospects")
      .get().count;
    const totalBlogProspects = db
      .prepare("SELECT COUNT(*) as count FROM blog_prospects")
      .get().count;
    const totalEmails = db
      .prepare("SELECT COUNT(*) as count FROM emails")
      .get().count;
    const totalBlogEmails = db
      .prepare("SELECT COUNT(*) as count FROM blog_emails")
      .get().count;
    const totalLeads = db
      .prepare("SELECT COUNT(*) as count FROM leads")
      .get().count;

    // Today's stats
    const todayStats = db
      .prepare("SELECT * FROM daily_limits WHERE date = ?")
      .get(today);
    const todayStatsDefault = {
      prospects_added: 0,
      emails_found: 0,
      blog_assets_found: 0,
      outreach_sent: 0,
    };

    // Lead status breakdown
    const leadStatuses = db
      .prepare(
        `
      SELECT status, COUNT(*) as count
      FROM leads
      GROUP BY status
    `
      )
      .all();

    // Recent activity (last 10 prospects)
    const recentProspects = db
      .prepare(
        `
      SELECT * FROM prospects
      ORDER BY created_at DESC
      LIMIT 10
    `
      )
      .all();

    // Campaign performance
    const campaignPerformance = db
      .prepare(
        `
      SELECT
        c.name,
        COUNT(DISTINCT l.prospect_id) as prospect_count,
        COUNT(DISTINCT e.id) as email_count,
        COUNT(DISTINCT CASE WHEN l.status = 'OUTREACH_SENT' THEN l.id END) as outreach_count
      FROM campaigns c
      LEFT JOIN leads l ON c.id = l.campaign_id
      LEFT JOIN prospects p ON l.prospect_id = p.id
      LEFT JOIN emails e ON p.id = e.prospect_id
      GROUP BY c.id
      ORDER BY prospect_count DESC
    `
      )
      .all();

    // Source type breakdown
    const sourceBreakdown = db
      .prepare(
        `
      SELECT
        COALESCE(source_type, 'unknown') as source,
        COUNT(*) as count
      FROM leads
      GROUP BY source_type
      ORDER BY count DESC
    `
      )
      .all();

    // Email queue stats
    const emailQueueStats = {
      pending: db
        .prepare(
          "SELECT COUNT(*) as count FROM email_queue WHERE status = 'pending'"
        )
        .get().count,
      sentToday: db
        .prepare(
          "SELECT COUNT(*) as count FROM email_queue WHERE status = 'sent' AND date(sent_at) = date('now')"
        )
        .get().count,
    };

    res.render("dashboard", {
      stats: {
        totalCampaigns,
        totalProspects,
        totalBlogProspects,
        totalEmails,
        totalBlogEmails,
        totalLeads,
        today: todayStats || todayStatsDefault,
      },
      leadStatuses,
      recentProspects,
      campaignPerformance,
      sourceBreakdown,
      emailQueueStats,
      user: req.session,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res
      .status(500)
      .render("error", {
        error: "Failed to load dashboard",
        user: req.session,
      });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           Outreach Admin Panel is now running!            ║
╠════════════════════════════════════════════════════════════╣
║  URL:          http://localhost:${PORT}                     ║
║  Password:     ${process.env.ADMIN_PASSWORD || "admin123"}                  ║
╠════════════════════════════════════════════════════════════╣
║  Press Ctrl+C to stop the server                           ║
╚════════════════════════════════════════════════════════════╝
  `);
});
