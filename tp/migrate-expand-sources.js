import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve("outreach_system.db");
const db = new Database(dbPath);

// Disable foreign key constraints during migration
db.pragma("foreign_keys = OFF");

console.log("Adding support for additional directory sources...");

try {
  // Backup data
  const existingLeads = db.prepare("SELECT * FROM leads").all();
  const existingProspects = db.prepare("SELECT * FROM prospects").all();

  console.log(`Backed up ${existingLeads.length} leads and ${existingProspects.length} prospects`);

  // Drop and recreate leads table
  db.prepare("DROP TABLE IF EXISTS leads").run();

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

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
  `);

  // Drop and recreate prospects table
  db.prepare("DROP TABLE IF EXISTS prospects").run();

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
        'google', 'bing', 'clutch', 'goodfirms', 'ahrefs', 'semrush', 'blog',
        'techreviewer', 'directory', 'other'
      )),
      last_source_query TEXT,
      prospect_type TEXT CHECK(prospect_type IN ('company', 'blog')) DEFAULT 'company',
      emails_extracted BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prospects_domain ON prospects(domain);
  `);

  // Restore leads
  const insertLead = db.prepare(`
    INSERT INTO leads (id, brand_id, campaign_id, prospect_id, status, verification_score,
                      verification_reason, source_type, source_query, found_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let validLeads = 0;
  for (const lead of existingLeads) {
    try {
      let sourceType = (lead.source_type || 'other').toLowerCase();
      // Map invalid source types to 'directory'
      const validTypes = ['google', 'bing', 'clutch', 'goodfirms', 'ahrefs', 'semrush', 'blog', 'techreviewer', 'directory', 'other'];
      if (!validTypes.includes(sourceType)) {
        sourceType = 'directory';
      }

      insertLead.run(lead.id, lead.brand_id, lead.campaign_id, lead.prospect_id,
                     lead.status, lead.verification_score, lead.verification_reason,
                     sourceType, lead.source_query, lead.found_at);
      validLeads++;
    } catch (e) {
      console.log(`  Skipping lead ${lead.id}: ${e.message}`);
    }
  }

  // Restore prospects
  const insertProspect = db.prepare(`
    INSERT INTO prospects (id, domain, company_name, website_url, city, country, country_code,
                          last_source_type, last_source_query, prospect_type, emails_extracted, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let validProspects = 0;
  for (const prospect of existingProspects) {
    try {
      let sourceType = (prospect.last_source_type || 'other').toLowerCase();
      const validTypes = ['google', 'bing', 'clutch', 'goodfirms', 'ahrefs', 'semrush', 'blog', 'techreviewer', 'directory', 'other'];
      if (!validTypes.includes(sourceType)) {
        sourceType = 'directory';
      }

      insertProspect.run(prospect.id, prospect.domain, prospect.company_name, prospect.website_url,
                        prospect.city, prospect.country, prospect.country_code,
                        sourceType, prospect.last_source_query, prospect.prospect_type || 'company',
                        prospect.emails_extracted || 0, prospect.created_at);
      validProspects++;
    } catch (e) {
      console.log(`  Skipping prospect ${prospect.id}: ${e.message}`);
    }
  }

  console.log(`\n✅ Restored ${validLeads} leads and ${validProspects} prospects`);
  console.log("\n✅ Migration complete!");
  console.log("\nSupported source types:");
  console.log("  - google, bing");
  console.log("  - clutch, goodfirms");
  console.log("  - ahrefs, semrush");
  console.log("  - blog");
  console.log("  - techreviewer");
  console.log("  - directory (for any other directory)");
  console.log("  - other (fallback)");

} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  // Re-enable foreign keys
  db.pragma("foreign_keys = ON");
  db.close();
}
