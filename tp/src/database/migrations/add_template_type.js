/**
 * Migration: Add template_type column to email_templates
 * Purpose: Distinguish between general outreach and blog outreach templates
 */
export function up(db) {
  // Add template_type column
  db.exec(`
    ALTER TABLE email_templates ADD COLUMN template_type TEXT
    CHECK(template_type IN ('general', 'blog'))
    DEFAULT 'general';
  `);

  // Update existing templates to be 'general' type
  db.exec(`
    UPDATE email_templates SET template_type = 'general' WHERE template_type IS NULL;
  `);

  console.log("✅ Migration: Added template_type column to email_templates");
}

export function down(db) {
  // SQLite doesn't support DROP COLUMN directly, so we recreate the table
  db.exec(`
    CREATE TABLE email_templates_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      variables TEXT,
      email_category TEXT CHECK(email_category IN (
        'main',
        'followup_1',
        'followup_2',
        'followup_3',
        'followup_4'
      )) DEFAULT 'main',
      sequence_number INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO email_templates_new (id, name, subject, body, variables, email_category, sequence_number, is_active, created_at)
    SELECT id, name, subject, body, variables, email_category, sequence_number, is_active, created_at
    FROM email_templates;

    DROP TABLE email_templates;
    ALTER TABLE email_templates_new RENAME TO email_templates;
  `);

  console.log("✅ Rollback: Removed template_type column from email_templates");
}
