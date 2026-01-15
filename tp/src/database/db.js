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
      blog_assets_found INTEGER DEFAULT 0,
      outreach_sent INTEGER DEFAULT 0
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
    CREATE INDEX IF NOT EXISTS idx_outreach_lead ON outreach_logs(lead_id);
    CREATE INDEX IF NOT EXISTS idx_exclusions_value ON exclusions(value);
  `);

  console.log("Schema Initialization Complete ✅");

  /* =========================
     POPULATE INITIAL DATA
  ========================= */
  populateInitialData();
}

function populateInitialData() {
  console.log("Populating initial data...");

  // Check if data already exists
  const countryCount = db
    .prepare("SELECT COUNT(*) as count FROM countries")
    .get().count;
  if (countryCount > 0) {
    console.log("  Initial data already exists, skipping...");
    return;
  }

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

  const insertCountry = db.prepare("INSERT INTO countries (name) VALUES (?)");
  const countryIds = {};
  for (const country of countries) {
    const info = insertCountry.run(country);
    countryIds[country] = info.lastInsertRowid;
  }
  console.log(`  ✓ Inserted ${countries.length} countries`);

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
    "INSERT INTO cities (country_id, name) VALUES (?, ?)"
  );
  const cityIds = {};
  for (const [country, cities] of Object.entries(citiesByCountry)) {
    const countryId = countryIds[country];
    for (const city of cities) {
      const info = insertCity.run(countryId, city);
      const key = `${city}_${country}`;
      cityIds[key] = info.lastInsertRowid;
    }
  }
  console.log(`  ✓ Inserted ${Object.keys(cityIds).length} cities`);

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
    "INSERT INTO outreach_keywords (phrase) VALUES (?)"
  );
  const keywordIds = {};
  for (const keyword of keywords) {
    const info = insertKeyword.run(keyword);
    keywordIds[keyword] = info.lastInsertRowid;
  }
  console.log(`  ✓ Inserted ${keywords.length} keywords`);

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
      text: '("top" OR "best" OR "tools" OR "companies" OR "agencies") + 2025',
    },
  ];

  const insertModifier = db.prepare(
    "INSERT INTO search_modifiers (category, modifier) VALUES (?, ?)"
  );

  for (const mod of modifiers) {
    insertModifier.run(mod.category, mod.text);
  }
  console.log(`  ✓ Inserted ${modifiers.length} search modifiers`);

  // 5. Generate Search Queries (Keyword + City)
  const insertQuery = db.prepare(
    "INSERT INTO search_queries (keyword_id, city_id, query) VALUES (?, ?, ?)"
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
  console.log(`  ✓ Generated ${queries.length} search queries`);
  console.log("Initial data population complete ✅");
}

export { db, initSchema };
