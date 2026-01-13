import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve("outreach_system.db");
const db = new Database(dbPath);

const today = new Date().toISOString().split('T')[0];

console.log(`Checking daily limits for ${today}...`);
console.log(``);

const stats = db.prepare("SELECT * FROM daily_limits WHERE date = ?").get(today);

if (stats) {
  console.log(`Prospects Added:    ${stats.prospects_added}/100`);
  console.log(`Emails Found:       ${stats.emails_found}`);
  console.log(`Blog Assets Found:  ${stats.blog_assets_found}/100`);
  console.log(`Outreach Sent:      ${stats.outreach_sent}`);
  console.log(``);

  if (stats.prospects_added >= 100) {
    console.log(`❌ PROSPECT LIMIT REACHED (${stats.prospects_added}/100)`);
  } else if (stats.blog_assets_found >= 100) {
    console.log(`❌ BLOG ASSET LIMIT REACHED (${stats.blog_assets_found}/100)`);
  } else {
    console.log(`✅ Limits OK - Can continue`);
    console.log(`   Remaining: ${100 - stats.prospects_added} prospects, ${100 - stats.blog_assets_found} blogs`);
  }
} else {
  console.log(`No record found for today - creating fresh record...`);
  db.prepare("INSERT INTO daily_limits (date, prospects_added, emails_found, blog_assets_found, outreach_sent) VALUES (?, 0, 0, 0, 0)").run(today);
  console.log(`✅ Fresh record created - Ready to start`);
}

db.close();
