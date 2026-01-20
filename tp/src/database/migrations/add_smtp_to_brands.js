import { db } from "../db.js";

console.log("Running migration: Add SMTP configuration to brands table...");

// Disable foreign key constraints before transaction
db.pragma("foreign_keys = OFF");

const transaction = db.transaction(() => {
  // 1. Rename existing table
  db.prepare("DROP TABLE IF EXISTS brands_temp").run();
  db.prepare("ALTER TABLE brands RENAME TO brands_temp").run();

  // 2. Create new table with SMTP fields
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      website TEXT,
      -- SMTP Configuration
      smtp_host TEXT,
      smtp_port INTEGER DEFAULT 587,
      smtp_secure INTEGER DEFAULT 0,
      smtp_user TEXT,
      smtp_password TEXT,
      smtp_from_name TEXT,
      smtp_from_email TEXT,
      smtp_is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `
  ).run();

  // 3. Copy data from old table
  db.prepare(
    `
    INSERT INTO brands (id, name, website, created_at)
    SELECT id, name, website, created_at FROM brands_temp
  `
  ).run();

  // 4. Optionally migrate SMTP config from smtp_config table to brands
  // If there's only one active SMTP config, add it to the first brand
  const smtpConfig = db.prepare("SELECT * FROM smtp_config WHERE is_active = 1 LIMIT 1").get();
  if (smtpConfig) {
    const firstBrand = db.prepare("SELECT id FROM brands LIMIT 1").get();
    if (firstBrand) {
      db.prepare(
        `
        UPDATE brands
        SET smtp_host = ?,
            smtp_port = ?,
            smtp_secure = ?,
            smtp_user = ?,
            smtp_password = ?,
            smtp_from_name = ?,
            smtp_from_email = ?
        WHERE id = ?
      `
      ).run(
        smtpConfig.host,
        smtpConfig.port,
        smtpConfig.secure,
        smtpConfig.user,
        smtpConfig.password,
        smtpConfig.from_name,
        smtpConfig.from_email,
        firstBrand.id
      );
      console.log("✓ Migrated existing SMTP config to first brand");
    }
  }

  // 5. Drop old table
  db.prepare("DROP TABLE brands_temp").run();

  console.log("✓ Brands table updated with SMTP fields");
  console.log("Migration completed successfully.");
});

try {
  transaction();
  // Re-enable foreign key constraints after transaction
  db.pragma("foreign_keys = ON");
} catch (error) {
  db.pragma("foreign_keys = ON");
  console.error("Migration failed:", error);
  process.exit(1);
}
