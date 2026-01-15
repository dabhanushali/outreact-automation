/**
 * Database Query Testing Utility
 * Usage: node test-db.js
 */

import { db, initSchema } from "./src/database/db.js";

// Initialize schema
initSchema();

// ============================================
// Run your queries below
// ============================================

// Reset emails_extracted for a specific domain
const resetDomain = "Agency Outreach";
const result = db
  .prepare("DELETE from brands WHERE name = ?")
  .run(resetDomain);
console.log(
  `Reset emails_extracted for ${resetDomain}: ${result.changes} row(s) affected`
);

// Show all unprocessed prospects
console.log("\n--- Unprocessed Prospects ---");
const unprocessed = db
  .prepare(
    "SELECT id, domain, company_name, emails_extracted FROM prospects WHERE emails_extracted = 0 LIMIT 10"
  )
  .all();
console.table(unprocessed);

// Show email counts per prospect
console.log("\n--- Email Counts by Prospect ---");
const emailCounts = db
  .prepare(
    `
    SELECT p.domain, p.company_name, COUNT(e.id) as email_count
    FROM prospects p
    LEFT JOIN emails e ON p.id = e.prospect_id
    GROUP BY p.id
    ORDER BY email_count DESC
    LIMIT 10
  `
  )
  .all();
console.table(emailCounts);

// Show all extracted emails
console.log("\n--- All Emails ---");
const emails = db
  .prepare(
    "SELECT email, source_page, confidence FROM emails ORDER BY created_at DESC LIMIT 20"
  )
  .all();
console.table(emails);

console.log("\n✅ Done!");
