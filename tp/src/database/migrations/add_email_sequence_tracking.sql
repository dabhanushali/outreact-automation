-- Migration: Add Email Sequence Tracking
-- This adds support for tracking email sequences (main + 4 follow-ups)

-- Add email_category and sequence_number to email_templates
ALTER TABLE email_templates ADD COLUMN email_category TEXT CHECK(email_category IN (
  'main',
  'followup_1',
  'followup_2',
  'followup_3',
  'followup_4'
)) DEFAULT 'main';

ALTER TABLE email_templates ADD COLUMN sequence_number INTEGER DEFAULT 0;

-- Add email_category, sequence_number, and parent_log_id to email_queue
ALTER TABLE email_queue ADD COLUMN email_category TEXT CHECK(email_category IN (
  'main',
  'followup_1',
  'followup_2',
  'followup_3',
  'followup_4'
)) DEFAULT 'main';

ALTER TABLE email_queue ADD COLUMN sequence_number INTEGER DEFAULT 0;

ALTER TABLE email_queue ADD COLUMN parent_log_id INTEGER REFERENCES outreach_logs(id);

-- Add email_category, sequence_number, and parent_log_id to outreach_logs
ALTER TABLE outreach_logs ADD COLUMN email_category TEXT CHECK(email_category IN (
  'main',
  'followup_1',
  'followup_2',
  'followup_3',
  'followup_4',
  'manual'
)) DEFAULT 'main';

ALTER TABLE outreach_logs ADD COLUMN sequence_number INTEGER DEFAULT 0;

ALTER TABLE outreach_logs ADD COLUMN parent_log_id INTEGER REFERENCES outreach_logs(id);

-- Add scheduled_at column for follow-up scheduling
ALTER TABLE email_queue ADD COLUMN scheduled_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Create index on parent_log_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_outreach_logs_parent ON outreach_logs(parent_log_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_parent ON email_queue(parent_log_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_category ON email_queue(email_category);
CREATE INDEX IF NOT EXISTS idx_outreach_logs_category ON outreach_logs(email_category);

-- Update existing templates
UPDATE email_templates SET
  email_category = 'main',
  sequence_number = 0
WHERE email_category IS NULL;
