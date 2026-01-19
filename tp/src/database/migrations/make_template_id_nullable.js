import { db } from "../db.js";

console.log("Running migration: Make template_id nullable in email_queue...");

const transaction = db.transaction(() => {
  // 1. Rename existing table
  // Use IF EXISTS to check if we already renamed it or if original exists
  // But sqlite doesn't support IF EXISTS on RENAME easily.
  // We assume email_queue exists as we check schema before.

  // NOTE: If migration failed previously, we might have email_queue_temp_v2 lying around or email_queue might be the old one.
  // To be robust:
  // Check if email_queue_temp_v2 exists. If so, drop it?
  db.prepare("DROP TABLE IF EXISTS email_queue_temp_v2").run();

  db.prepare("ALTER TABLE email_queue RENAME TO email_queue_temp_v2").run();

  // 2. Create new table with nullable template_id
  db.prepare(
    `
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
    )
  `
  ).run();

  // 3. Copy data
  db.prepare(
    `
    INSERT INTO email_queue (
      id, lead_id, blog_lead_id, email_id, blog_email_id, template_id,
      to_email, subject, body, status, scheduled_for, sent_at,
      error_message, attempts, message_id, created_at
    )
    SELECT 
      id, lead_id, blog_lead_id, email_id, blog_email_id, template_id,
      to_email, subject, body, status, scheduled_for, sent_at,
      error_message, attempts, message_id, created_at
    FROM email_queue_temp_v2
  `
  ).run();

  // 4. Drop old table
  db.prepare("DROP TABLE email_queue_temp_v2").run();

  // 5. Recreate indexes
  db.prepare("DROP INDEX IF EXISTS idx_email_queue_status").run();
  db.prepare(
    "CREATE INDEX idx_email_queue_status ON email_queue(status)"
  ).run();

  db.prepare("DROP INDEX IF EXISTS idx_email_queue_scheduled_for").run();
  db.prepare(
    "CREATE INDEX idx_email_queue_scheduled_for ON email_queue(scheduled_for)"
  ).run();

  db.prepare("DROP INDEX IF EXISTS idx_email_queue_lead_id").run();
  db.prepare(
    "CREATE INDEX idx_email_queue_lead_id ON email_queue(lead_id)"
  ).run();

  db.prepare("DROP INDEX IF EXISTS idx_email_queue_blog_lead_id").run();
  db.prepare(
    "CREATE INDEX idx_email_queue_blog_lead_id ON email_queue(blog_lead_id)"
  ).run();

  console.log("Migration completed successfully.");
});

try {
  transaction();
} catch (error) {
  console.error("Migration failed:", error);
  process.exit(1);
}
