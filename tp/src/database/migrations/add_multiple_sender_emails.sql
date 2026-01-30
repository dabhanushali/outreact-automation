-- Migration: Add Multiple Sender Emails per Brand
-- This allows brands to have multiple sender emails for anti-bot detection
-- and maintains sender consistency for follow-ups

-- 1. Create new table for brand sender emails
CREATE TABLE IF NOT EXISTS brand_sender_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  from_name TEXT,
  is_active INTEGER DEFAULT 1,
  daily_limit INTEGER DEFAULT 20,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  UNIQUE (brand_id, email)
);

-- 2. Add sender_email column to email_queue
ALTER TABLE email_queue ADD COLUMN sender_email TEXT;

-- 3. Add sender_email column to outreach_logs
ALTER TABLE outreach_logs ADD COLUMN sender_email TEXT;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_brand_sender_emails_brand ON brand_sender_emails(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_sender_emails_active ON brand_sender_emails(is_active);
CREATE INDEX IF NOT EXISTS idx_email_queue_sender ON email_queue(sender_email);
CREATE INDEX IF NOT EXISTS idx_outreach_logs_sender ON outreach_logs(sender_email);

-- 5. Migrate existing brands: copy current smtp_from_email to brand_sender_emails
INSERT OR IGNORE INTO brand_sender_emails (brand_id, email, from_name)
SELECT id, smtp_from_email, smtp_from_name
FROM brands
WHERE smtp_from_email IS NOT NULL
  AND smtp_from_email != ''
  AND NOT EXISTS (
    SELECT 1 FROM brand_sender_emails
    WHERE brand_sender_emails.brand_id = brands.id
    AND brand_sender_emails.email = brands.smtp_from_email
  );
