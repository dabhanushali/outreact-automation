/**
 * Database Query Testing Utility
 * Usage: node test-db.js
 */

import { db } from "./src/database/db.js";

// ============================================
// Run your queries below
// ============================================

console.log("\n--- Update Lead SENT_AT ---");

const result = db
  .prepare("UPDATE outreach_logs SET sent_at = ? WHERE id = ?")
  .run("2026-01-14 10:54:47", 5);

console.log(`Rows affected: ${result.changes}`);

console.log("\n✅ Done!");
