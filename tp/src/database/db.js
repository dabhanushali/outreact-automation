import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve("outreach_system.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

function initSchema() {
  console.log("Initializing Outreach System Schema (v1.2)...");

  /* =========================
     BRANDS
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      website TEXT,
      -- SMTP Configuration
      smtp_host TEXT,
      smtp_port INTEGER DEFAULT 587,
      smtp_secure INTEGER DEFAULT 0,
      smtp_user TEXT,
      smtp_password TEXT,
      smtp_from_name TEXT,
      smtp_from_email TEXT,
      smtp_is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /* =========================
     CAMPAIGNS
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      target_url TEXT,
      keywords TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (brand_id) REFERENCES brands(id),
      UNIQUE (brand_id, name)
    );
  `);

  /* =========================
     CAMPAIGN ASSETS (BLOGS / PAGES)
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      type TEXT CHECK(type IN ('blog','page')) DEFAULT 'blog',
      title TEXT,
      url TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      UNIQUE (campaign_id, url)
    );
  `);

  /* =========================
     PROSPECTS
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS prospects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL UNIQUE,
      company_name TEXT,
      website_url TEXT,
      city TEXT,
      country TEXT,
      country_code TEXT,
      last_source_type TEXT CHECK(last_source_type IN (
        'google',
        'bing',
        'clutch',
        'goodfirms',
        'ahrefs',
        'semrush',
        'techreviewer',
        'directory',
        'other'
      )),
      last_source_query TEXT,
      prospect_type TEXT CHECK(prospect_type IN ('company')) DEFAULT 'company',
      emails_extracted BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /* =========================
     BLOG PROSPECTS
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS blog_prospects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL UNIQUE,
      blog_name TEXT,
      website_url TEXT,
      last_source_type TEXT CHECK(last_source_type IN (
        'blog',
        'google',
        'other'
      )),
      last_source_query TEXT,
      emails_extracted BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /* =========================
     BLOG EMAILS
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS blog_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blog_prospect_id INTEGER NOT NULL,
      email TEXT NOT NULL UNIQUE,
      source_page TEXT,
      is_domain_match BOOLEAN DEFAULT 1,
      is_generic BOOLEAN DEFAULT 1,
      confidence INTEGER DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (blog_prospect_id) REFERENCES blog_prospects(id)
    );
  `);

  /* =========================
     EMAILS
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER NOT NULL,
      email TEXT NOT NULL UNIQUE,
      source_page TEXT,
      is_domain_match BOOLEAN DEFAULT 1,
      is_generic BOOLEAN DEFAULT 1,
      confidence INTEGER DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prospect_id) REFERENCES prospects(id)
    );
  `);

  /* =========================
     LEADS (Campaign × Prospect)
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id INTEGER NOT NULL,
      campaign_id INTEGER NOT NULL,
      prospect_id INTEGER NOT NULL,
      status TEXT CHECK(status IN (
        'NEW',
        'READY',
        'OUTREACH_SENT',
        'REPLIED',
        'REJECTED'
      )) DEFAULT 'NEW',
      verification_score INTEGER,
      verification_reason TEXT,
      source_type TEXT CHECK(source_type IN (
        'google',
        'bing',
        'clutch',
        'goodfirms',
        'ahrefs',
        'semrush',
        'blog',
        'techreviewer',
        'directory',
        'other'
      )),
      source_query TEXT,
      found_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (brand_id) REFERENCES brands(id),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY (prospect_id) REFERENCES prospects(id),
      UNIQUE (campaign_id, prospect_id)
    );
  `);

  /* =========================
     BLOG LEADS (Blog Prospect × Campaign)
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS blog_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id INTEGER NOT NULL,
      campaign_id INTEGER NOT NULL,
      blog_prospect_id INTEGER NOT NULL,
      status TEXT CHECK(status IN (
        'NEW',
        'READY',
        'OUTREACH_SENT',
        'REPLIED',
        'REJECTED'
      )) DEFAULT 'NEW',
      source_type TEXT CHECK(source_type IN (
        'blog',
        'google',
        'directory',
        'other'
      )),
      source_query TEXT,
      found_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (brand_id) REFERENCES brands(id),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY (blog_prospect_id) REFERENCES blog_prospects(id),
      UNIQUE (campaign_id, blog_prospect_id)
    );
  `);

  /* =========================
     OUTREACH LOGS (PER BLOG)
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS outreach_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      blog_lead_id INTEGER,
      asset_id INTEGER,
      email_id INTEGER,
      blog_email_id INTEGER,
      email_category TEXT CHECK(email_category IN (
        'main',
        'followup_1',
        'followup_2',
        'followup_3',
        'followup_4',
        'manual'
      )) DEFAULT 'main',
      sequence_number INTEGER DEFAULT 0,
      parent_log_id INTEGER REFERENCES outreach_logs(id),
      status TEXT CHECK(status IN (
        'SENT',
        'OPENED',
        'REPLIED',
        'REJECTED'
      )) DEFAULT 'SENT',
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (blog_lead_id) REFERENCES blog_leads(id),
      FOREIGN KEY (asset_id) REFERENCES campaign_assets(id),
      FOREIGN KEY (email_id) REFERENCES emails(id),
      FOREIGN KEY (blog_email_id) REFERENCES blog_emails(id),
      CHECK (lead_id IS NOT NULL OR blog_lead_id IS NOT NULL),
      CHECK (email_id IS NOT NULL OR blog_email_id IS NOT NULL)
    );
  `);

  /* =========================
     EMAIL OUTREACH: TEMPLATES
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      variables TEXT,
      email_category TEXT CHECK(email_category IN (
        'main',
        'followup_1',
        'followup_2',
        'followup_3',
        'followup_4'
      )) DEFAULT 'main',
      sequence_number INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /* =========================
     EMAIL OUTREACH: QUEUE
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id INTEGER REFERENCES brands(id),
      lead_id INTEGER REFERENCES leads(id),
      blog_lead_id INTEGER REFERENCES blog_leads(id),
      email_id INTEGER REFERENCES emails(id),
      blog_email_id INTEGER REFERENCES blog_emails(id),
      template_id INTEGER REFERENCES email_templates(id),
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      email_category TEXT CHECK(email_category IN (
        'main',
        'followup_1',
        'followup_2',
        'followup_3',
        'followup_4'
      )) DEFAULT 'main',
      sequence_number INTEGER DEFAULT 0,
      parent_log_id INTEGER REFERENCES outreach_logs(id),
      status TEXT DEFAULT 'pending',
      scheduled_for DATETIME DEFAULT CURRENT_TIMESTAMP,
      scheduled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME,
      error_message TEXT,
      attempts INTEGER DEFAULT 0,
      message_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CHECK (lead_id IS NOT NULL OR blog_lead_id IS NOT NULL),
      CHECK (email_id IS NOT NULL OR blog_email_id IS NOT NULL)
    );
  `);

  /* =========================
     EMAIL OUTREACH: SMTP CONFIG
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS smtp_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      secure INTEGER DEFAULT 0,
      user TEXT,
      password TEXT,
      from_name TEXT,
      from_email TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /* =========================
     EXCLUSIONS
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS exclusions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT CHECK(type IN ('domain','email')) NOT NULL,
      value TEXT NOT NULL UNIQUE,
      reason TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /* =========================
     DIRECTORIES
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS directories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      platform TEXT CHECK(platform IN ('clutch','goodfirms','other')) NOT NULL,
      country TEXT,
      city TEXT,
      category TEXT,
      is_active INTEGER DEFAULT 1,
      last_scraped_at DATETIME,
      scrape_count INTEGER DEFAULT 0,
      companies_found INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /* =========================
     DAILY LIMITS
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_limits (
      date TEXT PRIMARY KEY,
      prospects_added INTEGER DEFAULT 0,
      emails_found INTEGER DEFAULT 0,
      blog_assets_found INTEGER DEFAULT 0,
      outreach_sent INTEGER DEFAULT 0
    );
  `);

  /* =========================
     SCRIPT EXECUTION LOGS
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS script_execution_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      script_type TEXT NOT NULL,
      status TEXT CHECK(status IN ('running', 'completed', 'failed')) DEFAULT 'running',
      message TEXT,
      progress INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /* =========================
     SYSTEM SETTINGS
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /* =========================
     GEO + KEYWORDS + MODIFIERS
  ========================= */
  db.exec(`
    CREATE TABLE IF NOT EXISTS countries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(country_id, name),
      FOREIGN KEY (country_id) REFERENCES countries(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS outreach_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phrase TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // --- NEW TABLE ADDED HERE ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_modifiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT CHECK(category IN ('guest_post', 'resource', 'link_submission', 'listicle')) NOT NULL,
      modifier TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS search_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword_id INTEGER NOT NULL,
      city_id INTEGER NOT NULL,
      query TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(keyword_id, city_id),
      FOREIGN KEY (keyword_id) REFERENCES outreach_keywords(id),
      FOREIGN KEY (city_id) REFERENCES cities(id)
    );
  `);

  /* =========================
     INDEXES
  ========================= */
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prospects_domain ON prospects(domain);
    CREATE INDEX IF NOT EXISTS idx_blog_prospects_domain ON blog_prospects(domain);
    CREATE INDEX IF NOT EXISTS idx_emails_prospect ON emails(prospect_id);
    CREATE INDEX IF NOT EXISTS idx_blog_emails_prospect ON blog_emails(blog_prospect_id);
    CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_blog_leads_campaign ON blog_leads(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_blog_leads_status ON blog_leads(status);
    CREATE INDEX IF NOT EXISTS idx_outreach_lead ON outreach_logs(lead_id);
    CREATE INDEX IF NOT EXISTS idx_outreach_blog_lead ON outreach_logs(blog_lead_id);
    CREATE INDEX IF NOT EXISTS idx_exclusions_value ON exclusions(value);
    CREATE INDEX IF NOT EXISTS idx_directories_platform ON directories(platform);
    CREATE INDEX IF NOT EXISTS idx_directories_active ON directories(is_active);
    CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
    CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled ON email_queue(scheduled_for);
    -- Note: Indexes for new columns (parent_log_id, email_category) are created in migrateDatabase()
  `);

  console.log("Schema Initialization Complete ✅");

  /* =========================
     MIGRATE EXISTING DATABASE
  ========================= */
  migrateDatabase();

  /* =========================
     POPULATE INITIAL DATA
  ========================= */
  populateInitialData();
}

/**
 * Migrate existing database to add new columns
 * This ensures backwards compatibility when schema changes are made
 */
function migrateDatabase() {
  console.log("Checking for database migrations...");

  let needsEmailQueueIndexes = false;
  let needsOutreachLogsIndexes = false;

  // Get list of columns in outreach_logs table
  const outreachLogsColumns = db.prepare("PRAGMA table_info(outreach_logs)").all();
  const outreachLogsColumnNames = outreachLogsColumns.map(col => col.name);

  // Add missing columns to outreach_logs
  if (!outreachLogsColumnNames.includes('email_category')) {
    console.log("  → Adding email_category column to outreach_logs");
    db.exec("ALTER TABLE outreach_logs ADD COLUMN email_category TEXT CHECK(email_category IN ('main', 'followup_1', 'followup_2', 'followup_3', 'followup_4', 'manual')) DEFAULT 'main'");
    needsOutreachLogsIndexes = true;
  }

  if (!outreachLogsColumnNames.includes('sequence_number')) {
    console.log("  → Adding sequence_number column to outreach_logs");
    db.exec("ALTER TABLE outreach_logs ADD COLUMN sequence_number INTEGER DEFAULT 0");
  }

  if (!outreachLogsColumnNames.includes('parent_log_id')) {
    console.log("  → Adding parent_log_id column to outreach_logs");
    db.exec("ALTER TABLE outreach_logs ADD COLUMN parent_log_id INTEGER REFERENCES outreach_logs(id)");
    needsOutreachLogsIndexes = true;
  }

  // Get list of columns in email_queue table
  const emailQueueColumns = db.prepare("PRAGMA table_info(email_queue)").all();
  const emailQueueColumnNames = emailQueueColumns.map(col => col.name);

  // Add missing columns to email_queue
  if (!emailQueueColumnNames.includes('email_category')) {
    console.log("  → Adding email_category column to email_queue");
    db.exec("ALTER TABLE email_queue ADD COLUMN email_category TEXT CHECK(email_category IN ('main', 'followup_1', 'followup_2', 'followup_3', 'followup_4')) DEFAULT 'main'");
    needsEmailQueueIndexes = true;
  }

  if (!emailQueueColumnNames.includes('sequence_number')) {
    console.log("  → Adding sequence_number column to email_queue");
    db.exec("ALTER TABLE email_queue ADD COLUMN sequence_number INTEGER DEFAULT 0");
  }

  if (!emailQueueColumnNames.includes('parent_log_id')) {
    console.log("  → Adding parent_log_id column to email_queue");
    db.exec("ALTER TABLE email_queue ADD COLUMN parent_log_id INTEGER REFERENCES outreach_logs(id)");
    needsEmailQueueIndexes = true;
  }

  if (!emailQueueColumnNames.includes('scheduled_at')) {
    console.log("  → Adding scheduled_at column to email_queue");
    db.exec("ALTER TABLE email_queue ADD COLUMN scheduled_at DATETIME");
    // Update existing rows to have current timestamp
    db.exec("UPDATE email_queue SET scheduled_at = created_at WHERE scheduled_at IS NULL");
  }

  // Get list of columns in email_templates table
  const emailTemplatesColumns = db.prepare("PRAGMA table_info(email_templates)").all();
  const emailTemplatesColumnNames = emailTemplatesColumns.map(col => col.name);

  // Add missing columns to email_templates
  if (!emailTemplatesColumnNames.includes('email_category')) {
    console.log("  → Adding email_category column to email_templates");
    db.exec("ALTER TABLE email_templates ADD COLUMN email_category TEXT CHECK(email_category IN ('main', 'followup_1', 'followup_2', 'followup_3', 'followup_4')) DEFAULT 'main'");
  }

  if (!emailTemplatesColumnNames.includes('sequence_number')) {
    console.log("  → Adding sequence_number column to email_templates");
    db.exec("ALTER TABLE email_templates ADD COLUMN sequence_number INTEGER DEFAULT 0");
  }

  // Create indexes for new columns if they were added
  if (needsEmailQueueIndexes) {
    console.log("  → Creating indexes for email_queue new columns");
    try {
      db.exec("CREATE INDEX IF NOT EXISTS idx_email_queue_parent ON email_queue(parent_log_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_email_queue_category ON email_queue(email_category)");
    } catch (e) {
      console.log("    (Note: Some indexes may already exist)");
    }
  }

  if (needsOutreachLogsIndexes) {
    console.log("  → Creating indexes for outreach_logs new columns");
    try {
      db.exec("CREATE INDEX IF NOT EXISTS idx_outreach_logs_parent ON outreach_logs(parent_log_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_outreach_logs_category ON outreach_logs(email_category)");
    } catch (e) {
      console.log("    (Note: Some indexes may already exist)");
    }
  }

  // Check search_queries table for column name migration (location_id -> city_id)
  const searchQueriesColumns = db.prepare("PRAGMA table_info(search_queries)").all();
  const searchQueriesColumnNames = searchQueriesColumns.map(col => col.name);

  if (searchQueriesColumnNames.includes('location_id') && !searchQueriesColumnNames.includes('city_id')) {
    console.log("  → Migrating search_queries.location_id to city_id");
    // SQLite doesn't support ALTER TABLE RENAME COLUMN directly in older versions
    // We need to recreate the table
    db.exec(`
      CREATE TABLE search_queries_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword_id INTEGER NOT NULL,
        city_id INTEGER NOT NULL,
        query TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(keyword_id, city_id),
        FOREIGN KEY (keyword_id) REFERENCES outreach_keywords(id),
        FOREIGN KEY (city_id) REFERENCES cities(id)
      );
    `);
    db.exec(`
      INSERT INTO search_queries_new (id, keyword_id, city_id, query, created_at)
      SELECT id, keyword_id, location_id, query, created_at FROM search_queries;
    `);
    db.exec(`
      DROP TABLE search_queries;
    `);
    db.exec(`
      ALTER TABLE search_queries_new RENAME TO search_queries;
    `);
    console.log("  ✓ search_queries migration complete");
  }

  console.log("Database migrations complete ✅");
}

function populateInitialData() {
  console.log("Populating initial data...");

  console.log("  Checking and updating initial data...");

  // 1. Insert Countries
  const countries = [
    "India",
    "United States",
    "United Kingdom",
    "Canada",
    "Germany",
    "Australia",
    "France",
  ];

  const insertCountry = db.prepare(
    "INSERT OR IGNORE INTO countries (name) VALUES (?)"
  );
  const countryIds = {};
  for (const country of countries) {
    insertCountry.run(country);
    // Fetch ID to ensure we have it even if it existed
    const row = db
      .prepare("SELECT id FROM countries WHERE name = ?")
      .get(country);
    if (row) countryIds[country] = row.id;
  }
  console.log(`  ✓ Processed ${countries.length} countries`);

  // 2. Insert Cities
  const citiesByCountry = {
    India: [
      "Bangalore",
      "Hyderabad",
      "Chennai",
      "Pune",
      "Mumbai",
      "Noida",
      "Kolkata",
      "Ahmedabad",
      "Chandigarh",
      "Surat",
      "Vadodara",
      "Rajkot",
      "Gandhinagar",
    ],
    "United States": [
      "San Francisco Bay Area",
      "New York City",
      "Seattle",
      "Austin",
      "Los Angeles",
      "Boston",
      "Chicago",
      "Washington DC",
    ],
    "United Kingdom": [
      "London",
      "Manchester",
      "Birmingham",
      "Edinburgh",
      "Leeds",
      "Bristol",
    ],
    Canada: ["Toronto", "Vancouver", "Montreal", "Ottawa", "Calgary"],
    Germany: ["Berlin", "Munich", "Hamburg", "Frankfurt", "Stuttgart"],
    Australia: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"],
    France: ["Paris", "Lyon", "Toulouse", "Nantes", "Bordeaux"],
  };

  const insertCity = db.prepare(
    "INSERT OR IGNORE INTO cities (country_id, name) VALUES (?, ?)"
  );
  const cityIds = {};
  for (const [country, cities] of Object.entries(citiesByCountry)) {
    const countryId = countryIds[country];
    if (countryId) {
      for (const city of cities) {
        insertCity.run(countryId, city);
        const row = db
          .prepare("SELECT id FROM cities WHERE country_id = ? AND name = ?")
          .get(countryId, city);
        if (row) {
          const key = `${city}_${country}`;
          cityIds[key] = row.id;
        }
      }
    }
  }
  console.log(`  ✓ Processed cities`);

  // 3. Insert Outreach Keywords - REMOVED (users will add their own)
  // No default keywords inserted

  // 4. Insert Search Modifiers
  const modifiers = [
    {
      category: "guest_post",
      text: '("write for us" OR "guest post" OR "submit article" OR "contributor")',
    },
    {
      category: "resource",
      text: '("resources" OR "useful links" OR "reading list" OR "recommended")',
    },
    {
      category: "link_submission",
      text: '("suggest a resource" OR "submit a resource" OR "add your link")',
    },
    {
      category: "listicle",
      text: '("top" OR "best" OR "tools" OR "companies" OR "agencies") + 2026', // Updated year
    },
  ];

  const insertModifier = db.prepare(
    "INSERT OR IGNORE INTO search_modifiers (category, modifier) VALUES (?, ?)"
  );

  for (const mod of modifiers) {
    insertModifier.run(mod.category, mod.text);
  }
  console.log(`  ✓ Processed search modifiers`);

  // 5. Generate Search Queries - REMOVED (no default keywords to generate from)

  // 6. Insert System Settings
  const defaultSettings = [
    {
      key: "daily_prospect_limit",
      value: "10",
      description: "Maximum number of prospects to add per day",
    },
    {
      key: "daily_blog_limit",
      value: "10",
      description: "Maximum number of blog assets to find per day",
    },
    {
      key: "daily_email_limit",
      value: "50",
      description: "Maximum number of emails to extract per day",
    },
    {
      key: "daily_outreach_limit",
      value: "20",
      description: "Maximum number of outreach emails to send per day",
    },
    // Follow-up Email Settings
    {
      key: "followup_1_interval_days",
      value: "3",
      description: "Days after main email to send follow-up #1",
    },
    {
      key: "followup_2_interval_days",
      value: "7",
      description: "Days after main email to send follow-up #2",
    },
    {
      key: "followup_3_interval_days",
      value: "14",
      description: "Days after main email to send follow-up #3",
    },
    {
      key: "followup_4_interval_days",
      value: "21",
      description: "Days after main email to send follow-up #4",
    },
    {
      key: "auto_schedule_followups",
      value: "false",
      description: "Automatically schedule follow-ups when main email is sent (true/false)",
    },
  ];

  const insertSetting = db.prepare(
    "INSERT OR IGNORE INTO system_settings (key, value, description) VALUES (?, ?, ?)"
  );

  for (const setting of defaultSettings) {
    insertSetting.run(setting.key, setting.value, setting.description);
  }
  console.log(`  ✓ Processed system settings`);

  // 7. Insert Default Brand and Campaign (only if not exists)
  const defaultBrand = { name: "My Agency", website: "https://example.com" };
  const brandInfo = db.prepare("INSERT OR IGNORE INTO brands (name, website) VALUES (?, ?)").run(
    defaultBrand.name,
    defaultBrand.website
  );

  const brandRow = db
    .prepare("SELECT id FROM brands WHERE name = ?")
    .get(defaultBrand.name);
  if (brandRow) {
    const defaultCampaign = { name: "General Outreach", brand_id: brandRow.id };
    const campaignInfo = db
      .prepare("INSERT OR IGNORE INTO campaigns (name, brand_id) VALUES (?, ?)")
      .run(defaultCampaign.name, defaultCampaign.brand_id);

    // Only log if actually created
    if (campaignInfo.changes > 0) {
      const campaignRow = db
        .prepare("SELECT id FROM campaigns WHERE name = ? AND brand_id = ?")
        .get(defaultCampaign.name, defaultCampaign.brand_id);
      if (campaignRow)
        console.log(
          `  ✓ Created default campaign 'General Outreach' (ID: ${campaignRow.id})`
        );
    }
  }

  // 8. Insert Default Directories - REMOVED (users will add their own)

  // 9. Insert Default Email Templates (Main + 4 Follow-ups) - ONLY if they don't exist
  // Check if templates already exist
  const existingTemplateCount = db.prepare("SELECT COUNT(*) as count FROM email_templates").get().count;
  const templatesExist = existingTemplateCount >= 5;

  if (!templatesExist) {
    console.log("  → Adding default email templates...");
    const emailTemplates = [
      {
        name: "Main Outreach Email",
        email_category: "main",
        sequence_number: 0,
        subject: "Partnership Opportunity with {{brand_name}}",
        body: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 2px solid #007bff; padding-bottom: 10px; margin-bottom: 20px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
    .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>{{brand_name}}</h2>
    </div>

    <p>Hi {{first_name}},</p>

    <p>I hope this email finds you well. I came across {{company_name}} while researching leading software development companies in {{city}}, and I was impressed by your work.</p>

    <p>I'm reaching out because I believe there's a potential partnership opportunity between our organizations that could be mutually beneficial.</p>

    <p>At {{brand_name}}, we specialize in {{specialization}} and have successfully helped companies like yours to {{value_proposition}}.</p>

    <p>Would you be open to a brief 15-minute call next week to explore how we might collaborate?</p>

    <p>You can book a time that works for you here: {{calendar_link}}</p>

    <p>Looking forward to the possibility of working together.</p>

    <p>Best regards,<br>
    {{sender_name}}<br>
    {{sender_title}}<br>
    {{brand_name}}<br>
    {{sender_email}}<br>
    {{website}}</p>

    <div class="footer">
      <p>This email was sent to {{email}}. If you'd like to stop receiving these emails, please reply with "unsubscribe".</p>
    </div>
  </div>
</body>
</html>`,
      is_active: 1,
    },
    {
      name: "Follow-up Email 1",
      email_category: "followup_1",
      sequence_number: 1,
      subject: "Re: Partnership Opportunity with {{brand_name}}",
      body: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 2px solid #007bff; padding-bottom: 10px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>{{brand_name}}</h2>
    </div>

    <p>Hi {{first_name}},</p>

    <p>I wanted to quickly follow up on my previous email regarding a potential partnership opportunity between {{brand_name}} and {{company_name}}.</p>

    <p>I understand you're busy, but I genuinely believe there's value in exploring how we could work together. Many companies in {{city}} have found our partnership model to be beneficial for {{specific_benefit}}.</p>

    <p>Would you have 10 minutes this week for a quick chat? I'm flexible with timing and can work around your schedule.</p>

    <p>Let me know what works for you.</p>

    <p>Best regards,<br>
    {{sender_name}}<br>
    {{brand_name}}<br>
    {{sender_email}}</p>
  </div>
</body>
</html>`,
      is_active: 1,
    },
    {
      name: "Follow-up Email 2",
      email_category: "followup_2",
      sequence_number: 2,
      subject: "Quick question about {{company_name}}",
      body: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <p>Hi {{first_name}},</p>

    <p>I've been following {{company_name}}'s work in {{city}} and noticed your recent achievements in the software development space.</p>

    <p>We've recently helped similar companies achieve {{result_metric}} through our {{service_type}} services, and I thought this might be relevant to your current initiatives.</p>

    <p>Would you be interested in seeing a brief case study or hearing more about what's working for others in your industry?</p>

    <p>No pressure at all - just thought it might be valuable context.</p>

    <p>Best,<br>
    {{sender_name}}<br>
    {{brand_name}}</p>
  </div>
</body>
</html>`,
      is_active: 1,
    },
    {
      name: "Follow-up Email 3",
      email_category: "followup_3",
      sequence_number: 3,
      subject: "Still interested?",
      body: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <p>Hi {{first_name}},</p>

    <p>I've reached out a couple of times about exploring a potential partnership, but I haven't heard back.</p>

    <p>I completely understand if this isn't a priority right now or if you're not interested. However, I wanted to share one quick thing before I close this thread.</p>

    <p>We're currently working with a select group of partners in {{city}} on {{current_initiative}}, and given {{company_name}}'s reputation, I thought you might want to be aware of it.</p>

    <p>If you're ever interested in future collaborations, feel free to reach out.</p>

    <p>Wishing you continued success,<br>
    {{sender_name}}<br>
    {{brand_name}}</p>
  </div>
</body>
</html>`,
      is_active: 1,
    },
    {
      name: "Follow-up Email 4 (Final)",
      email_category: "followup_4",
      sequence_number: 4,
      subject: "One last thought {{first_name}}",
      body: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <p>Hi {{first_name}},</p>

    <p>I want to respect your time, so this will be my last email on this topic.</p>

    <p>Over the past few weeks, I've reached out about a potential partnership between {{brand_name}} and {{company_name}}. While I haven't heard back, I still believe there could be value in connecting.</p>

    <p>I'll leave the ball in your court. If you ever want to explore collaboration opportunities, I'd be happy to chat:</p>

    <p>• Email: {{sender_email}}<br>
    • Calendar: {{calendar_link}}<br>
    • Website: {{website}}</p>

    <p>Regardless, I wish you and {{company_name}} continued success in {{city}}.</p>

    <p>Best regards,<br>
    {{sender_name}}<br>
    {{brand_name}}</p>

    <hr>
    <p><small>P.S. If you're interested in staying updated on industry insights and partnership opportunities, feel free to subscribe to our newsletter: {{newsletter_link}}</small></p>
  </div>
</body>
</html>`,
      is_active: 1,
    },
  ];

  const insertTemplate = db.prepare(`
    INSERT OR IGNORE INTO email_templates (name, subject, body, email_category, sequence_number, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let templateCount = 0;
  for (const template of emailTemplates) {
    const result = insertTemplate.run(
      template.name,
      template.subject,
      template.body,
      template.email_category,
      template.sequence_number,
      template.is_active
    );
    if (result.changes > 0) templateCount++;
  }

  if (templateCount > 0) {
    console.log(`  ✓ Added ${templateCount} default email templates (1 main + 4 follow-ups)`);
  }
  } else {
    console.log(`  ✓ Email templates already exist (${existingTemplateCount} templates)`);
  }

  console.log("Initial data population complete ✅");
}

export { db, initSchema };
