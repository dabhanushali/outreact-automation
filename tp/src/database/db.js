import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve("outreach_system.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

function initSchema() {
  console.log("Initializing Outreach System Schema...");

  db.exec(`
    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      website TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      target_url TEXT,
      keywords TEXT, -- Retaining for InputParser compatibility
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (brand_id) REFERENCES brands(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS prospects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL UNIQUE,
      company_name TEXT,
      website_url TEXT, -- Renamed from url to website_url per user schema
      city TEXT,
      country TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS prospect_verification (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER NOT NULL,
      method TEXT CHECK(method IN ('keyword','ai')),
      decision TEXT CHECK(decision IN ('yes','no')),
      score INTEGER,
      reasoning TEXT,
      verified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prospect_id) REFERENCES prospects(id)
    );
  `);

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      prospect_id INTEGER NOT NULL,
      status TEXT CHECK(status IN (
        'NEW',
        'VERIFIED',
        'EMAIL_FOUND',
        'READY',
        'OUTREACH_SENT',
        'REPLIED',
        'REJECTED'
      )) DEFAULT 'NEW',
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
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY (prospect_id) REFERENCES prospects(id),
      UNIQUE (campaign_id, prospect_id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS exclusions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT CHECK(type IN ('domain','email')) NOT NULL,
      value TEXT NOT NULL UNIQUE,
      reason TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_limits (
      date TEXT PRIMARY KEY,
      prospects_added INTEGER DEFAULT 0,
      emails_found INTEGER DEFAULT 0,
      outreach_sent INTEGER DEFAULT 0
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prospects_domain ON prospects(domain);
    CREATE INDEX IF NOT EXISTS idx_emails_prospect ON emails(prospect_id);
    CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_exclusions_value ON exclusions(value);
  `);

  console.log("Schema Initialization Complete.");

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
}

export { db, initSchema };
