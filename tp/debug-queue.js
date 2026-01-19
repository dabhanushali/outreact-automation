import { db } from "./src/database/db.js";

console.log("--- Email Queue Debug Inspector ---");
console.log("Current Time (UTC):", new Date().toISOString());
console.log("Current Time (Local):", new Date().toLocaleString());

const stats = db
  .prepare(
    `
  SELECT 
    status, 
    count(*) as count 
  FROM email_queue 
  GROUP BY status
`
  )
  .all();

console.log("\nQueue Stats:");
console.table(stats);

const pending = db
  .prepare(
    `
  SELECT 
    id, 
    status, 
    scheduled_for, 
    datetime(scheduled_for) as scheduled_datetime,
    datetime('now') as now_datetime,
    (scheduled_for <= datetime('now')) as is_ready,
    created_at 
  FROM email_queue 
  WHERE status = 'pending'
`
  )
  .all();

console.log("\nPending Emails Detail:");
if (pending.length === 0) {
  console.log("No pending emails found.");
} else {
  console.table(pending);
}

const all = db.prepare("SELECT * FROM email_queue LIMIT 5").all();
console.log("\nFirst 5 rows raw:");
console.log(all);
