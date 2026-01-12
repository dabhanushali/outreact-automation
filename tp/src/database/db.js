import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve("outreach_system.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

function initSchema() {
  console.log("Initializing Outreach System Schema (v1.1)...");

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        'semrush'
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
      outreach_sent INTEGER DEFAULT 0
    );
  `);

  /* =========================
     GEO + KEYWORDS
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
    CREATE INDEX IF NOT EXISTS idx_emails_prospect ON emails(prospect_id);
    CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_outreach_lead ON outreach_logs(lead_id);
    CREATE INDEX IF NOT EXISTS idx_exclusions_value ON exclusions(value);
  `);

  console.log("Schema Initialization Complete ✅");
}

export { db, initSchema };
