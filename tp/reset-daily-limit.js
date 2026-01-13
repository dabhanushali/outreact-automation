import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve("outreach_system.db");
const db = new Database(dbPath);

const today = new Date().toISOString().split('T')[0];

console.log(`Resetting daily limit for ${today}...`);

// Delete today's record to reset counters
const info = db.prepare("DELETE FROM daily_limits WHERE date = ?").run(today);

if (info.changes > 0) {
  console.log(`✅ Reset daily limit for ${today}`);
} else {
  console.log(`No daily limit record found for ${today}`);
}

db.close();
