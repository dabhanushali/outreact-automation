import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve("outreach_system.db");
const db = new Database(dbPath);

console.log("Checking current database schema...\n");

// Check leads table
const leadSchema = db.prepare("PRAGMA table_info(leads)").all();
const sourceTypeCol = leadSchema.find(col => col.name === 'source_type');

if (sourceTypeCol) {
  console.log("✅ leads.source_type column exists");

  // Try to extract the CHECK constraint
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='leads'").get();
  if (sql && sql.sql) {
    const match = sql.sql.match(/source_type[^)]*\)/);
    if (match) {
      console.log(`   Constraint: ${match[0]}`);

      // Check if it includes the new values
      if (match[0].includes('techreviewer') || match[0].includes('directory')) {
        console.log("\n✅ Schema is UP TO DATE - includes new source types!\n");
      } else {
        console.log("\n❌ Schema is OUTDATED - does not include techreviewer/directory\n");
        console.log("You need to restart your application to load the new schema.\n");
      }
    }
  }
} else {
  console.log("❌ leads.source_type column NOT FOUND!\n");
}

// Check prospects table
const prospectSchema = db.prepare("PRAGMA table_info(prospects)").all();
const lastSourceCol = prospectSchema.find(col => col.name === 'last_source_type');

if (lastSourceCol) {
  console.log("✅ prospects.last_source_type column exists");
} else {
  console.log("❌ prospects.last_source_type column NOT FOUND!");
}

// Count by source type
const bySource = db.prepare(`
  SELECT source_type, COUNT(*) as count
  FROM leads
  GROUP BY source_type
`).all();

console.log("\n📊 Current leads by source:");
bySource.forEach(row => {
  console.log(`  ${row.source_type}: ${row.count}`);
});

db.close();
