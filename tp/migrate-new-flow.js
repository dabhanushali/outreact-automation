import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve("outreach_system.db");
const db = new Database(dbPath);

console.log("Migrating database for new exploration/extraction flow...");

try {
  // Check if columns already exist
  const columns = db.prepare("PRAGMA table_info(prospects)").all();
  const hasProspectType = columns.some(col => col.name === 'prospect_type');
  const hasEmailsExtracted = columns.some(col => col.name === 'emails_extracted');

  if (hasProspectType && hasEmailsExtracted) {
    console.log("✅ Columns already exist. Backfilling data...");

    // Update existing blog source_type prospects to blog type
    const updateBlogType = db.prepare(`
      UPDATE prospects
      SET prospect_type = 'blog'
      WHERE last_source_type = 'blog'
    `);
    const blogResult = updateBlogType.run();
    console.log(`✅ Marked ${blogResult.changes} prospects as 'blog' type`);

    // Update existing non-blog prospects to company type
    const updateCompanyType = db.prepare(`
      UPDATE prospects
      SET prospect_type = 'company'
      WHERE prospect_type IS NULL OR prospect_type != 'blog'
    `);
    const companyResult = updateCompanyType.run();
    console.log(`✅ Marked ${companyResult.changes} prospects as 'company' type`);

  } else {
    console.log("Adding new columns...");

    if (!hasProspectType) {
      db.prepare(`
        ALTER TABLE prospects ADD COLUMN prospect_type TEXT CHECK(prospect_type IN ('company', 'blog')) DEFAULT 'company';
      `).run();
      console.log("✅ Added column 'prospect_type'");
    }

    if (!hasEmailsExtracted) {
      db.prepare(`
        ALTER TABLE prospects ADD COLUMN emails_extracted BOOLEAN DEFAULT 0;
      `).run();
      console.log("✅ Added column 'emails_extracted'");
    }

    console.log("\nBackfilling data...");

    // Mark existing blog source_type prospects
    const updateBlogType = db.prepare(`
      UPDATE prospects
      SET prospect_type = 'blog'
      WHERE last_source_type = 'blog'
    `);
    const blogResult = updateBlogType.run();
    console.log(`✅ Marked ${blogResult.changes} prospects as 'blog' type`);

    // Update non-blog prospects
    const updateCompanyType = db.prepare(`
      UPDATE prospects
      SET prospect_type = 'company'
      WHERE prospect_type IS NULL
    `);
    const companyResult = updateCompanyType.run();
    console.log(`✅ Marked ${companyResult.changes} prospects as 'company' type`);

    // Check for existing emails and mark as extracted
    const updateEmailsExtracted = db.prepare(`
      UPDATE prospects
      SET emails_extracted = 1
      WHERE id IN (
        SELECT DISTINCT prospect_id
        FROM emails
      )
    `);
    const emailResult = updateEmailsExtracted.run();
    console.log(`✅ Marked ${emailResult.changes} prospects as emails extracted (had existing emails)`);
  }

  console.log("\n✅ Migration complete!");
  console.log("\nNew flow:");
  console.log("  1. Use city/directory/blog modes to explore (no email extraction)");
  console.log("  2. Run 'npm run outreach:extract-emails' to extract emails");
  console.log("\nProspect types:");
  console.log("  - 'company': Regular companies (email extraction will process these)");
  console.log("  - 'blog': Blog websites (email extraction will skip these)");

} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  db.close();
}
