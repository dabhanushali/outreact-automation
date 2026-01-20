import { db } from "../db.js";

console.log("Running migration: Add blog_lead_id and blog_email_id to outreach_logs...");

const transaction = db.transaction(() => {
  // 1. Check if outreach_logs_temp exists and drop it (in case previous migration failed)
  db.prepare("DROP TABLE IF EXISTS outreach_logs_temp").run();

  // 2. Rename existing table
  db.prepare("ALTER TABLE outreach_logs RENAME TO outreach_logs_temp").run();

  // 3. Create new table with nullable blog_lead_id and blog_email_id
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS outreach_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      blog_lead_id INTEGER,
      asset_id INTEGER,
      email_id INTEGER,
      blog_email_id INTEGER,
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
    )
  `
  ).run();

  // 4. Copy data (old columns map directly)
  db.prepare(
    `
    INSERT INTO outreach_logs (
      id, lead_id, asset_id, email_id, status, sent_at
    )
    SELECT
      id, lead_id, asset_id, email_id, status, sent_at
    FROM outreach_logs_temp
  `
  ).run();

  // 5. Drop old table
  db.prepare("DROP TABLE outreach_logs_temp").run();

  // 6. Recreate indexes
  db.prepare("DROP INDEX IF EXISTS idx_outreach_lead").run();
  db.prepare(
    "CREATE INDEX idx_outreach_lead ON outreach_logs(lead_id)"
  ).run();

  db.prepare("DROP INDEX IF EXISTS idx_outreach_blog_lead").run();
  db.prepare(
    "CREATE INDEX idx_outreach_blog_lead ON outreach_logs(blog_lead_id)"
  ).run();

  console.log("Migration completed successfully.");
});

try {
  transaction();
} catch (error) {
  console.error("Migration failed:", error);
  process.exit(1);
}
