import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve("outreach_system.db");
const db = new Database(dbPath);

console.log("Adding 'blog' to source_type allowed values...");

try {
  // Get existing data
  const existingLeads = db.prepare("SELECT * FROM leads").all();

  // Drop old table
  db.prepare("DROP TABLE IF EXISTS leads").run();

  // Create new table with updated schema
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
        'blog'
      )),
      source_query TEXT,
      found_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (brand_id) REFERENCES brands(id),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY (prospect_id) REFERENCES prospects(id),
      UNIQUE (campaign_id, prospect_id)
    );
  `);

  // Recreate indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
  `);

  // Restore data
  if (existingLeads.length > 0) {
    const insert = db.prepare(`
      INSERT INTO leads (id, brand_id, campaign_id, prospect_id, status, verification_score,
                        verification_reason, source_type, source_query, found_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((leads) => {
      for (const lead of leads) {
        insert.run(lead.id, lead.brand_id, lead.campaign_id, lead.prospect_id,
                  lead.status, lead.verification_score, lead.verification_reason,
                  lead.source_type, lead.source_query, lead.found_at);
      }
    });

    insertMany(existingLeads);
    console.log(`✅ Restored ${existingLeads.length} existing leads`);
  }

  console.log("✅ Migration complete!");
  console.log("   'blog' is now a valid source_type");
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  db.close();
}
