import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve("outreach_system.db");
const db = new Database(dbPath);

console.log("Adding source tracking to prospects table...");

try {
  // Check if column already exists
  const columns = db.prepare("PRAGMA table_info(prospects)").all();
  const hasLastSourceType = columns.some(col => col.name === 'last_source_type');

  if (hasLastSourceType) {
    console.log("✅ Column 'last_source_type' already exists in prospects table");
  } else {
    // Add the new columns
    db.prepare(`
      ALTER TABLE prospects ADD COLUMN last_source_type TEXT CHECK(last_source_type IN (
        'google', 'bing', 'clutch', 'goodfirms', 'ahrefs', 'semrush', 'blog'
      ));
    `).run();

    db.prepare(`
      ALTER TABLE prospects ADD COLUMN last_source_query TEXT;
    `).run();

    console.log("✅ Added columns 'last_source_type' and 'last_source_query' to prospects table");

    // Backfill existing data from leads table
    const updateStmt = db.prepare(`
      UPDATE prospects
      SET last_source_type = (
        SELECT l.source_type
        FROM leads l
        WHERE l.prospect_id = prospects.id
        ORDER BY l.found_at DESC
        LIMIT 1
      ),
      last_source_query = (
        SELECT l.source_query
        FROM leads l
        WHERE l.prospect_id = prospects.id
        ORDER BY l.found_at DESC
        LIMIT 1
      )
      WHERE id IN (
        SELECT DISTINCT prospect_id FROM leads
      )
    `);

    const result = updateStmt.run();
    console.log(`✅ Backfilled ${result.changes} prospects with source information`);
  }

  console.log("\n✅ Migration complete!");
  console.log("   Prospects now track their most recent source.");
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  db.close();
}
