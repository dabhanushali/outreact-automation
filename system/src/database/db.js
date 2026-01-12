import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve("outreach_system.db");
const db = new Database(dbPath);

// Enable WAL for concurrency
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function initSchema() {
  console.log("Initializing Complete Outreach System Schema...");

  /* =====================================================
     1. BRANDS (EnactOn, Proposal.biz, EnactSoft)
  ===================================================== */
  db.exec(`
    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      website TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /* =====================================================
     2. CAMPAIGNS (City Search, Blog Outreach, Competitor)
  ===================================================== */
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      campaign_type TEXT CHECK(campaign_type IN (
        'city_search',
        'blog_outreach',
        'competitor_backlink'
      )) NOT NULL,
      target_url TEXT,
      target_da_min INTEGER DEFAULT 0,
      target_da_max INTEGER DEFAULT 100,
      status TEXT CHECK(status IN ('active','paused','completed')) DEFAULT 'active',
      daily_limit INTEGER DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (brand_id) REFERENCES brands(id)
    );
  `);

  /* =====================================================
     3. SEARCH QUERIES (Track executed searches)
  ===================================================== */
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      query_text TEXT NOT NULL,
      search_engine TEXT CHECK(search_engine IN ('google','bing')) DEFAULT 'google',
      location TEXT,
      results_count INTEGER DEFAULT 0,
      processed_count INTEGER DEFAULT 0,
      last_executed_at DATETIME,
      status TEXT CHECK(status IN (
        'pending',
        'processing',
        'completed',
        'failed',
        'exhausted'
      )) DEFAULT 'pending',
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      UNIQUE (campaign_id, query_text, search_engine, location)
    );
  `);

  /* =====================================================
     4. KEYWORD VARIATIONS (For blog campaigns)
  ===================================================== */
  db.exec(`
    CREATE TABLE IF NOT EXISTS keyword_variations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      base_keyword TEXT NOT NULL,
      operator TEXT,
      full_query_template TEXT,
      priority INTEGER DEFAULT 1,
      tried INTEGER CHECK(tried IN (0, 1)) DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );
  `);

  /* =====================================================
     5. PROSPECTS (Canonical companies/domains)
  ===================================================== */
  db.exec(`
    CREATE TABLE IF NOT EXISTS prospects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL UNIQUE,
      company_name TEXT,
      website_url TEXT,
      city TEXT,
      country TEXT,
      domain_authority INTEGER,
      contact_page_url TEXT,
      is_verified INTEGER CHECK(is_verified IN (0, 1)) DEFAULT 0,
      verification_method TEXT CHECK(verification_method IN ('keyword','ai','manual')),
      verification_score INTEGER,
      verification_reasoning TEXT,
      last_checked_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /* =====================================================
     6. PROSPECT VERIFICATION (Historical audit trail)
  ===================================================== */
  db.exec(`
    CREATE TABLE IF NOT EXISTS prospect_verification_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER NOT NULL,
      method TEXT CHECK(method IN ('keyword','ai','manual')),
      decision TEXT CHECK(decision IN ('yes','no','uncertain')),
      score INTEGER,
      reasoning TEXT,
      verified_by TEXT,
      verified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prospect_id) REFERENCES prospects(id)
    );
  `);

  /* =====================================================
     7. EMAILS (Visible emails only)
  ===================================================== */
  db.exec(`
    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      source_page TEXT,
      is_domain_match INTEGER CHECK(is_domain_match IN (0, 1)) DEFAULT 1,
      is_generic INTEGER CHECK(is_generic IN (0, 1)) DEFAULT 0,
      confidence INTEGER DEFAULT 100,
      extraction_method TEXT CHECK(extraction_method IN (
        'contact_page',
        'footer',
        'about_page',
        'homepage'
      )),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prospect_id) REFERENCES prospects(id),
      UNIQUE (prospect_id, email)
    );
  `);

  /* =====================================================
     8. LEADS (Prospect × Campaign intersection)
  ===================================================== */
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      prospect_id INTEGER NOT NULL,
      search_query_id INTEGER,
      status TEXT CHECK(status IN (
        'NEW',
        'VERIFIED',
        'EMAIL_FOUND',
        'READY',
        'OUTREACH_SENT',
        'REPLIED',
        'BOUNCED',
        'REJECTED',
        'SKIPPED'
      )) DEFAULT 'NEW',
      tier TEXT CHECK(tier IN ('tier1','tier2')),
      source_type TEXT CHECK(source_type IN (
        'google',
        'bing',
        'clutch',
        'goodfirms',
        'ahrefs',
        'semrush',
        'manual'
      )),
      source_query TEXT,
      outreach_sent_at DATETIME,
      replied_at DATETIME,
      notes TEXT,
      found_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY (prospect_id) REFERENCES prospects(id),
      FOREIGN KEY (search_query_id) REFERENCES search_queries(id),
      UNIQUE (campaign_id, prospect_id)
    );
  `);

  /* =====================================================
     9. EXCLUSIONS (Zero-duplication guard)
  ===================================================== */
  db.exec(`
    CREATE TABLE IF NOT EXISTS exclusions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT CHECK(type IN ('domain','email','company')) NOT NULL,
      value TEXT NOT NULL UNIQUE,
      reason TEXT,
      added_by TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /* =====================================================
     10. DAILY LIMITS (100/day safety)
  ===================================================== */
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_limits (
      date TEXT NOT NULL,
      campaign_id INTEGER NOT NULL,
      prospects_added INTEGER DEFAULT 0,
      emails_found INTEGER DEFAULT 0,
      outreach_sent INTEGER DEFAULT 0,
      PRIMARY KEY (date, campaign_id),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );
  `);

  /* =====================================================
     11. OUTREACH HISTORY (Email tracking)
  ===================================================== */
  db.exec(`
    CREATE TABLE IF NOT EXISTS outreach_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      email_id INTEGER NOT NULL,
      template_used TEXT,
      subject_line TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      opened_at DATETIME,
      clicked_at DATETIME,
      replied_at DATETIME,
      bounce_type TEXT CHECK(bounce_type IN ('hard','soft')),
      status TEXT CHECK(status IN (
        'sent',
        'delivered',
        'opened',
        'clicked',
        'replied',
        'bounced',
        'failed'
      )) DEFAULT 'sent',
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (email_id) REFERENCES emails(id)
    );
  `);

  /* =====================================================
     12. COMPETITOR BACKLINKS (Phase 2 - Future)
  ===================================================== */
  db.exec(`
    CREATE TABLE IF NOT EXISTS competitor_backlinks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      competitor_domain TEXT NOT NULL,
      backlink_source_url TEXT NOT NULL,
      backlink_source_domain TEXT,
      anchor_text TEXT,
      domain_authority INTEGER,
      discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed INTEGER CHECK(processed IN (0, 1)) DEFAULT 0,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      UNIQUE (competitor_domain, backlink_source_url)
    );
  `);

  /* =====================================================
     13. SYSTEM LOGS (Debugging & monitoring)
  ===================================================== */
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_level TEXT CHECK(log_level IN ('info','warning','error','debug')),
      module TEXT,
      message TEXT,
      data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /* =====================================================
     14. INDEXES (Performance & scale) - ENHANCED
  ===================================================== */
  db.exec(`
    -- Prospects indexes
    CREATE INDEX IF NOT EXISTS idx_prospects_domain ON prospects(domain);
    CREATE INDEX IF NOT EXISTS idx_prospects_da ON prospects(domain_authority);
    CREATE INDEX IF NOT EXISTS idx_prospects_verified ON prospects(is_verified);
    
    -- Emails indexes
    CREATE INDEX IF NOT EXISTS idx_emails_prospect ON emails(prospect_id);
    CREATE INDEX IF NOT EXISTS idx_emails_email ON emails(email);
    
    -- Leads indexes (enhanced with compound and temporal)
    CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_leads_prospect ON leads(prospect_id);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_tier ON leads(tier);
    CREATE INDEX IF NOT EXISTS idx_leads_found_at ON leads(found_at);
    CREATE INDEX IF NOT EXISTS idx_leads_campaign_status ON leads(campaign_id, status);
    CREATE INDEX IF NOT EXISTS idx_leads_outreach_sent ON leads(outreach_sent_at);
    
    -- Campaigns indexes (NEW)
    CREATE INDEX IF NOT EXISTS idx_campaigns_brand ON campaigns(brand_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_type ON campaigns(campaign_type);
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
    
    -- Search queries indexes
    CREATE INDEX IF NOT EXISTS idx_search_queries_campaign ON search_queries(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_search_queries_status ON search_queries(status);
    
    -- Keyword variations indexes (NEW)
    CREATE INDEX IF NOT EXISTS idx_keyword_variations_campaign ON keyword_variations(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_keyword_variations_tried ON keyword_variations(tried);
    
    -- Prospect verification history indexes (NEW)
    CREATE INDEX IF NOT EXISTS idx_verification_history_prospect ON prospect_verification_history(prospect_id);
    CREATE INDEX IF NOT EXISTS idx_verification_history_verified_at ON prospect_verification_history(verified_at);
    
    -- Exclusions indexes
    CREATE INDEX IF NOT EXISTS idx_exclusions_value ON exclusions(value);
    CREATE INDEX IF NOT EXISTS idx_exclusions_type ON exclusions(type);
    CREATE INDEX IF NOT EXISTS idx_exclusions_type_value ON exclusions(type, value);
    
    -- Outreach history indexes
    CREATE INDEX IF NOT EXISTS idx_outreach_lead ON outreach_history(lead_id);
    CREATE INDEX IF NOT EXISTS idx_outreach_email ON outreach_history(email_id);
    CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_history(status);
    CREATE INDEX IF NOT EXISTS idx_outreach_sent_at ON outreach_history(sent_at);
    
    -- Daily limits indexes
    CREATE INDEX IF NOT EXISTS idx_daily_limits_date ON daily_limits(date);
    CREATE INDEX IF NOT EXISTS idx_daily_limits_campaign ON daily_limits(campaign_id);
    
    -- System logs indexes (NEW - for cleanup queries)
    CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(log_level);
  `);

  /* =====================================================
     15. TRIGGERS (Automated maintenance)
  ===================================================== */
  db.exec(`
    -- Auto-cleanup old system logs (keep last 30 days)
    CREATE TRIGGER IF NOT EXISTS cleanup_old_logs
    AFTER INSERT ON system_logs
    BEGIN
      DELETE FROM system_logs 
      WHERE created_at < datetime('now', '-30 days');
    END;
  `);

  console.log("✅ Complete Schema Initialization Finished.");
}

/* =====================================================
   PREPARED STATEMENTS - OPTIMIZED FOR REUSE
===================================================== */

// Initialize prepared statements ONCE
const preparedStatements = {
  // Exclusions
  checkDomainExcluded: null,
  checkEmailExcluded: null,

  // Prospects
  getProspectByDomain: null,
  insertProspect: null,

  // Daily limits
  getDailyLimit: null,
  insertOrUpdateDailyLimit: null,
  incrementProspects: null,
  incrementEmails: null,
  incrementOutreach: null,

  // Campaigns
  getCampaign: null,

  // Leads
  insertLead: null,

  // Emails
  insertEmail: null,

  // Logs
  insertLog: null,
};

function initPreparedStatements() {
  preparedStatements.checkDomainExcluded = db.prepare(
    "SELECT 1 FROM exclusions WHERE type = 'domain' AND value = ?"
  );

  preparedStatements.checkEmailExcluded = db.prepare(
    "SELECT 1 FROM exclusions WHERE type = 'email' AND value = ?"
  );

  preparedStatements.getProspectByDomain = db.prepare(
    "SELECT * FROM prospects WHERE domain = ?"
  );

  preparedStatements.insertProspect = db.prepare(`
    INSERT OR IGNORE INTO prospects (domain, company_name, website_url, city, country)
    VALUES (?, ?, ?, ?, ?)
  `);

  preparedStatements.getDailyLimit = db.prepare(
    "SELECT prospects_added FROM daily_limits WHERE date = ? AND campaign_id = ?"
  );

  preparedStatements.getCampaign = db.prepare(
    "SELECT daily_limit FROM campaigns WHERE id = ?"
  );

  preparedStatements.insertOrUpdateDailyLimit = db.prepare(`
    INSERT INTO daily_limits (date, campaign_id, prospects_added, emails_found, outreach_sent)
    VALUES (?, ?, 0, 0, 0)
    ON CONFLICT(date, campaign_id) DO NOTHING
  `);

  preparedStatements.incrementProspects = db.prepare(`
    UPDATE daily_limits SET prospects_added = prospects_added + 1 WHERE date = ? AND campaign_id = ?
  `);

  preparedStatements.incrementEmails = db.prepare(`
    UPDATE daily_limits SET emails_found = emails_found + 1 WHERE date = ? AND campaign_id = ?
  `);

  preparedStatements.incrementOutreach = db.prepare(`
    UPDATE daily_limits SET outreach_sent = outreach_sent + 1 WHERE date = ? AND campaign_id = ?
  `);

  preparedStatements.insertLog = db.prepare(`
    INSERT INTO system_logs (log_level, module, message, data)
    VALUES (?, ?, ?, ?)
  `);
}

/* =====================================================
   HELPER FUNCTIONS - RACE-CONDITION SAFE
===================================================== */

// Check if domain is excluded (optimized)
function isDomainExcluded(domain) {
  return preparedStatements.checkDomainExcluded.get(domain) !== undefined;
}

// Check if email is excluded (optimized)
function isEmailExcluded(email) {
  return preparedStatements.checkEmailExcluded.get(email) !== undefined;
}

// Get or create prospect (RACE-CONDITION SAFE)
function getOrCreateProspect(domain, data = {}) {
  // Use a transaction to ensure atomicity
  const transaction = db.transaction(() => {
    // Try to insert (will be ignored if exists due to UNIQUE constraint)
    preparedStatements.insertProspect.run(
      domain,
      data.company_name || null,
      data.website_url || null,
      data.city || null,
      data.country || null
    );

    // Now fetch the prospect (either newly inserted or existing)
    return preparedStatements.getProspectByDomain.get(domain);
  });

  return transaction();
}

// Check daily limit for campaign (optimized)
function checkDailyLimit(
  campaignId,
  date = new Date().toISOString().split("T")[0]
) {
  const campaign = preparedStatements.getCampaign.get(campaignId);

  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  // Ensure row exists for today
  preparedStatements.insertOrUpdateDailyLimit.run(date, campaignId);

  const limit = preparedStatements.getDailyLimit.get(date, campaignId);
  const added = limit ? limit.prospects_added : 0;

  return {
    limit: campaign.daily_limit,
    used: added,
    remaining: campaign.daily_limit - added,
    canAdd: added < campaign.daily_limit,
  };
}

// Increment daily counter (optimized with transaction)
function incrementDailyCounter(
  campaignId,
  field = "prospects_added",
  date = new Date().toISOString().split("T")[0]
) {
  const transaction = db.transaction(() => {
    // Ensure row exists
    preparedStatements.insertOrUpdateDailyLimit.run(date, campaignId);

    // Update the specific counter using cached statement
    let stmt;
    if (field === "prospects_added")
      stmt = preparedStatements.incrementProspects;
    else if (field === "emails_found")
      stmt = preparedStatements.incrementEmails;
    else if (field === "outreach_sent")
      stmt = preparedStatements.incrementOutreach;

    if (stmt) {
      stmt.run(date, campaignId);
    } else {
      // Fallback for unknown fields (should rarely happen)
      db.prepare(
        `UPDATE daily_limits SET ${field} = ${field} + 1 WHERE date = ? AND campaign_id = ?`
      ).run(date, campaignId);
    }
  });

  transaction();
}

// Logging helper (optimized)
function log(level, module, message, data = null) {
  preparedStatements.insertLog.run(
    level,
    module,
    message,
    data ? JSON.stringify(data) : null
  );
}

// Manual cleanup function (if you want to run it on-demand)
function cleanupOldLogs(daysToKeep = 30) {
  const result = db
    .prepare(
      `
    DELETE FROM system_logs 
    WHERE created_at < datetime('now', '-' || ? || ' days')
  `
    )
    .run(daysToKeep);

  log("info", "maintenance", `Cleaned up ${result.changes} old log entries`);
  return result.changes;
}

/* =====================================================
   INITIALIZATION
===================================================== */

// Initialize schema and prepared statements
initSchema();
initPreparedStatements();

export {
  db,
  initSchema,
  isDomainExcluded,
  isEmailExcluded,
  getOrCreateProspect,
  checkDailyLimit,
  incrementDailyCounter,
  log,
  cleanupOldLogs,
};
