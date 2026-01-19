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
      FOREIGN KEY (brand_id) REFERENCES brands(id)
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
      lead_id INTEGER NOT NULL,
      asset_id INTEGER NOT NULL,
      email_id INTEGER,
      status TEXT CHECK(status IN (
        'SENT',
        'OPENED',
        'REPLIED',
        'REJECTED'
      )) DEFAULT 'SENT',
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (asset_id) REFERENCES campaign_assets(id),
      FOREIGN KEY (email_id) REFERENCES emails(id),
      UNIQUE (lead_id, asset_id)
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
      lead_id INTEGER REFERENCES leads(id),
      blog_lead_id INTEGER REFERENCES blog_leads(id),
      email_id INTEGER REFERENCES emails(id),
      blog_email_id INTEGER REFERENCES blog_emails(id),
      template_id INTEGER REFERENCES email_templates(id),
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      scheduled_for DATETIME DEFAULT CURRENT_TIMESTAMP,
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
    CREATE INDEX IF NOT EXISTS idx_exclusions_value ON exclusions(value);
    CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
    CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled ON email_queue(scheduled_for);
  `);

  console.log("Schema Initialization Complete ✅");

  /* =========================
     POPULATE INITIAL DATA
  ========================= */
  populateInitialData();
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

  // 3. Insert Outreach Keywords
  const keywords = [
    "software development company",
    "IT services company",
    "custom software development",
    "software app development",
    "enterprise software development",
    "mobile app development",
    "web app development",
    "IT consulting company",
    "technology development company",
    "software development firms",
  ];

  const insertKeyword = db.prepare(
    "INSERT OR IGNORE INTO outreach_keywords (phrase) VALUES (?)"
  );
  const keywordIds = {};
  for (const keyword of keywords) {
    insertKeyword.run(keyword);
    const row = db
      .prepare("SELECT id FROM outreach_keywords WHERE phrase = ?")
      .get(keyword);
    if (row) keywordIds[keyword] = row.id;
  }
  console.log(`  ✓ Processed keywords`);

  // 4. Insert Search Modifiers (NEW SECTION)
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

  // 5. Generate Search Queries (Keyword + City)
  const insertQuery = db.prepare(
    "INSERT OR IGNORE INTO search_queries (keyword_id, city_id, query) VALUES (?, ?, ?)"
  );
  const insertMany = db.transaction((qs) => {
    for (const q of qs) {
      insertQuery.run(q.keywordId, q.cityId, q.query);
    }
  });

  const queries = [];
  for (const [keyword, keywordId] of Object.entries(keywordIds)) {
    for (const [cityKey, cityId] of Object.entries(cityIds)) {
      const cityName = cityKey.split("_")[0];
      const query = `${keyword} ${cityName}`;
      queries.push({ keywordId, cityId, query });
    }
  }

  insertMany(queries);
  console.log(`  ✓ Generated search queries`);

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
  ];

  const insertSetting = db.prepare(
    "INSERT OR IGNORE INTO system_settings (key, value, description) VALUES (?, ?, ?)"
  );

  for (const setting of defaultSettings) {
    insertSetting.run(setting.key, setting.value, setting.description);
  }
  console.log(`  ✓ Processed system settings`);

  // 7. Insert Default Brand and Campaign (Fix missing initial data)
  const defaultBrand = { name: "My Agency", website: "https://example.com" };
  db.prepare("INSERT OR IGNORE INTO brands (name, website) VALUES (?, ?)").run(
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

    // If newly created or exists, get ID
    const campaignRow = db
      .prepare("SELECT id FROM campaigns WHERE name = ? AND brand_id = ?")
      .get(defaultCampaign.name, defaultCampaign.brand_id);
    if (campaignRow)
      console.log(
        `  ✓ Default Campaign 'General Outreach' ready (ID: ${campaignRow.id})`
      );
  }

  // 8. Insert Default Email Templates
  const templates = [
    {
      name: "General Connection",
      subject: "Partnership Inquiry - {{company}}",
      body: "Hi Team,\n\nI was browsing your website {{domain}} and found it very interesting.\n\nWe are looking for potential partners in this space. Would you be open to a quick chat?\n\nBest,\n[Your Name]",
    },
    {
      name: "Link Exchange",
      subject: "Collaboration Opportunity",
      body: "Hello,\n\nI run a blog in a similar niche and think our audiences would benefit from a collaboration.\n\nAre you open to guest posts or link exchanges?\n\nCheers,\n[Your Name]",
    },
  ];

  const insertTemplate = db.prepare(
    "INSERT OR IGNORE INTO email_templates (name, subject, body, variables, is_active) VALUES (?, ?, ?, '{{company}},{{domain}}', 1)"
  ); // Note: simplified check, assuming name unique constraint not there? Checked schema, name is not unique but we can query first.

  // Checking schema, name is NOT unique in email_templates definition above. So we check manually.
  const checkTemplate = db.prepare(
    "SELECT id FROM email_templates WHERE name = ?"
  );
  let tCount = 0;
  for (const t of templates) {
    if (!checkTemplate.get(t.name)) {
      insertTemplate.run(t.name, t.subject, t.body);
      tCount++;
    }
  }
  console.log(`  ✓ Added ${tCount} default email templates`);

  console.log("Initial data population complete ✅");
}

export { db, initSchema };
