import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve("outreach_system.db");
const db = new Database(dbPath);

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           PROSPECTS BY SOURCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

// Group prospects by source
const bySource = db.prepare(`
  SELECT
    l.source_type,
    COUNT(*) as count
  FROM leads l
  GROUP BY l.source_type
  ORDER BY count DESC
`).all();

// Get sample domains for each source
const sampleDomains = {};
bySource.forEach(row => {
  const samples = db.prepare(`
    SELECT DISTINCT p.domain
    FROM leads l
    JOIN prospects p ON l.prospect_id = p.id
    WHERE l.source_type = ?
    LIMIT 3
  `).all(row.source_type);
  sampleDomains[row.source_type] = samples.map(s => s.domain).join(', ');
});

console.log("\n📊 Prospects by Source Type:\n");
bySource.forEach(row => {
  console.log(`  ${row.source_type.toUpperCase().padEnd(10)}: ${row.count} prospects`);
  const samples = sampleDomains[row.source_type];
  if (samples) {
    console.log(`    Samples: ${samples}`);
  }
});

// Recent prospects with full details
const recent = db.prepare(`
  SELECT
    p.domain,
    p.company_name,
    l.source_type,
    l.source_query,
    l.status,
    DATE(l.found_at) as found_date
  FROM leads l
  JOIN prospects p ON l.prospect_id = p.id
  ORDER BY l.found_at DESC
  LIMIT 20
`).all();

console.log("\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  RECENT PROSPECTS (with source)\n");
console.log(`  {"Domain":<30} {"Source":<10} {"Status":<15} {"Query"}`);
console.log(`  ${'─'.repeat(90)}`);

recent.forEach(row => {
  const domain = row.domain.padEnd(30);
  const source = row.source_type.padEnd(10);
  const status = row.status.padEnd(15);
  const query = row.source_query ? row.source_query.substring(0, 30) : 'N/A';
  console.log(`  ${domain} ${source} ${status} ${query}`);
});

// Count by campaign and source
const byCampaign = db.prepare(`
  SELECT
    c.name as campaign,
    l.source_type,
    COUNT(DISTINCT l.prospect_id) as count
  FROM leads l
  JOIN campaigns c ON l.campaign_id = c.id
  GROUP BY c.name, l.source_type
  ORDER BY c.name, l.source_type
`).all();

console.log("\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  PROSPECTS BY CAMPAIGN + SOURCE\n");

const currentCampaign = null;
byCampaign.forEach(row => {
  if (row.campaign !== currentCampaign) {
    console.log(`\n  📁 ${row.campaign}`);
  }
  console.log(`     ${row.source_type}: ${row.count} prospects`);
});

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

db.close();
