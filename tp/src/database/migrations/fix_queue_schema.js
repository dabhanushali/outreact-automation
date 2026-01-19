import { db } from "../db.js";

console.log("Running migration: fix_queue_schema...");

try {
  // 1. Rename existing table
  console.log("Renaming existing table...");
  db.exec("ALTER TABLE email_queue RENAME TO email_queue_old");

  // 2. Create new table with nullable FKs and new columns
  console.log("Creating new table...");
  db.exec(`
    CREATE TABLE email_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      blog_lead_id INTEGER,
      email_id INTEGER,
      blog_email_id INTEGER,
      template_id INTEGER NOT NULL,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT CHECK(status IN ('pending', 'sending', 'sent', 'failed')) DEFAULT 'pending',
      scheduled_for DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME,
      error_message TEXT,
      attempts INTEGER DEFAULT 0,
      message_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (blog_lead_id) REFERENCES blog_leads(id),
      FOREIGN KEY (email_id) REFERENCES emails(id),
      FOREIGN KEY (blog_email_id) REFERENCES blog_emails(id),
      FOREIGN KEY (template_id) REFERENCES email_templates(id),
      CHECK (lead_id IS NOT NULL OR blog_lead_id IS NOT NULL),
      CHECK (email_id IS NOT NULL OR blog_email_id IS NOT NULL)
    );
  `);

  // 3. Re-create indexes
  console.log(" recreating indexes...");
  db.exec("CREATE INDEX idx_email_queue_status ON email_queue(status)");
  db.exec(
    "CREATE INDEX idx_email_queue_scheduled ON email_queue(scheduled_for)"
  );

  // 4. Migrate data (if any) - mapping old columns to new
  // Assuming old data was Company Leads
  console.log("Migrating data...");
  db.exec(`
    INSERT INTO email_queue (
      id, lead_id, email_id, template_id, to_email, subject, body,
      status, scheduled_for, sent_at, error_message, attempts, message_id, created_at
    )
    SELECT 
      id, lead_id, email_id, template_id, to_email, subject, body,
      status, scheduled_for, sent_at, error_message, attempts, message_id, created_at
    FROM email_queue_old
  `);

  // 5. Drop old table
  console.log("Dropping old table...");
  db.exec("DROP TABLE email_queue_old");

  console.log("Migration complete! ✅");
} catch (error) {
  console.error("Migration failed:", error);
  process.exit(1);
}
