import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve("outreach_system.db");
const db = new Database(dbPath);

const source = process.argv[2] || null;

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           PROSPECTS BY SOURCE (Easy Query!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

if (source) {
  // Query specific source
  const prospects = db.prepare(`
    SELECT
      domain,
      company_name,
      last_source_type as source,
      last_source_query as query,
      created_at
    FROM prospects
    WHERE LOWER(last_source_type) = LOWER(?)
    ORDER BY created_at DESC
  `).all(source);

  console.log(`\n📊 Prospects from: ${source.toUpperCase()}\n`);
  console.log(`  {"Domain":<35} {"Company":<40} {"Query"}`);
  console.log(`  ${'─'.repeat(100)}`);

  prospects.forEach(p => {
    const domain = p.domain.padEnd(35);
    const company = (p.company_name || 'N/A').padEnd(40).substring(0, 40);
    const query = p.query ? p.query.substring(0, 25) : 'N/A';
    console.log(`  ${domain} ${company} ${query}`);
  });

  console.log(`\n  Total: ${prospects.length} prospects\n`);

} else {
  // Show breakdown by source
  const bySource = db.prepare(`
    SELECT
      last_source_type as source,
      COUNT(*) as count
    FROM prospects
    WHERE last_source_type IS NOT NULL
    GROUP BY last_source_type
    ORDER BY count DESC
  `).all();

  console.log("\n📊 All Prospects by Source:\n");
  bySource.forEach(row => {
    console.log(`  ${row.source.padEnd(10)}: ${row.count} prospects`);
  });

  console.log("\n💡 Usage:");
  console.log(`  node query-prospects-by-source.js blog    # Show blog prospects`);
  console.log(`  node query-prospects-by-source.js clutch  # Show clutch prospects`);
  console.log(`  node query-prospects-by-source.js google  # Show google prospects`);
  console.log(`  node query-prospects-by-source.js        # Show all sources\n`);
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

db.close();
