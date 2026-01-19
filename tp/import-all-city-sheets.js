/**
 * Import ALL city sheets from Google Sheets as exclusions
 * Fetches directly using Google Sheets API
 */

import { db } from "./src/database/db.js";
import { ExclusionRepo } from "./src/repositories/ExclusionRepo.js";

const SHEET_ID = "14vCrMbqoR1eBe4x1BcjQZjQnggn_2_2kAylv7HayP-k";

// Sheets to import (excluding Final, Cliq Outreach Mails, Sheet19 as per user request)
const SHEETS_TO_IMPORT = [
  "Bangalore",
  "Hyderabad",
  "Mumbai",
  "Pune",
  "Chennai",
  "Ahmedabad",
  "Vadodra",
  "Rajkot",
  "Gandhinagar",
  "Surat",
  "Outreach Mail",
  "Sheet17",
  "Backlink Got",
];

console.log("\n╔════════════════════════════════════════════════════════════╗");
console.log("║   Importing ALL City Sheets from Google Spreadsheet       ║");
console.log("╚════════════════════════════════════════════════════════════╝\n");

async function fetchSheetData(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    sheetName
  )}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const csv = await response.text();
    return csv;
  } catch (error) {
    console.error(`  ✗ Error fetching ${sheetName}:`, error.message);
    return null;
  }
}

// Robust CSV Parser that handles quoted newlines
function parseBasicCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentVal = "";
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuote) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentVal += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuote = true;
      } else if (char === ",") {
        currentRow.push(currentVal.trim());
        currentVal = "";
      } else if (char === "\n" || char === "\r") {
        currentRow.push(currentVal.trim());
        if (currentRow.some((c) => c)) rows.push(currentRow);
        currentRow = [];
        currentVal = "";
        if (char === "\r" && text[i + 1] === "\n") i++;
      } else {
        currentVal += char;
      }
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    rows.push(currentRow);
  }
  return rows;
}

async function importSheet(sheetName) {
  console.log(`\n📥 Processing: ${sheetName}`);

  const csv = await fetchSheetData(sheetName);
  if (!csv) {
    console.log(`  ⊗ Skipping ${sheetName} (failed to fetch)`);
    return { added: 0, skipped: 0 };
  }

  const rows = parseBasicCSV(csv);
  if (rows.length === 0) {
    console.log(`  ⚠ Sheet is empty`);
    return { added: 0, skipped: 0 };
  }

  // Detect columns
  const header = rows[0].map((h) => h.toLowerCase().trim());
  const emailIdx = header.findIndex((h) => h.includes("email"));
  const websiteIdx = header.findIndex(
    (h) => h.includes("website") || h.includes("domain")
  );

  if (emailIdx === -1 && websiteIdx === -1) {
    console.log(
      `  ⚠ Could not find 'Email' or 'Website' columns in header: [${header.join(
        ", "
      )}]`
    );
    return { added: 0, skipped: 0 };
  }

  console.log(`  ✓ Found columns - Email: ${emailIdx}, Website: ${websiteIdx}`);

  let added = 0;
  let skipped = 0;

  // Process rows (skip header)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const email = emailIdx !== -1 ? row[emailIdx] : null;
    const website = websiteIdx !== -1 ? row[websiteIdx] : null;

    // Process Email
    if (email && email.includes("@")) {
      try {
        if (!ExclusionRepo.isEmailExcluded(email)) {
          ExclusionRepo.excludeEmail(
            email.toLowerCase().trim(),
            `Sheet: ${sheetName}`
          );
          added++;
        } else {
          skipped++;
        }
      } catch (e) {
        skipped++;
      }

      // Also exclude domain from email
      try {
        const domain = email.split("@")[1];
        if (
          domain &&
          domain.includes(".") &&
          !ExclusionRepo.isExcluded(domain)
        ) {
          ExclusionRepo.excludeDomain(
            domain.toLowerCase().trim(),
            `Sheet: ${sheetName} (via Email)`
          );
          added++;
        }
      } catch (e) {}
    }

    // Process Website
    if (website && website.includes(".")) {
      try {
        let domain = website
          .replace(/^(https?:\/\/)?(www\.)?/, "")
          .replace(/\/$/, "")
          .split("/")[0]
          .toLowerCase()
          .trim();
        if (domain && !ExclusionRepo.isExcluded(domain)) {
          ExclusionRepo.excludeDomain(domain, `Sheet: ${sheetName}`);
          added++;
        } else {
          skipped++;
        }
      } catch (e) {
        skipped++;
      }
    }
  }

  console.log(`  ✓ Added: ${added}, Skipped/Existing: ${skipped}`);
  return { added, skipped };
}

async function main() {
  let totalAdded = 0;
  let totalSkipped = 0;

  for (const sheetName of SHEETS_TO_IMPORT) {
    const result = await importSheet(sheetName);
    totalAdded += result.added;
    totalSkipped += result.skipped;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`IMPORT SUMMARY`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Total added:    ${totalAdded}`);
  console.log(`Total skipped:  ${totalSkipped}`);
  console.log(`Total processed: ${totalAdded + totalSkipped}`);
  console.log(`${"=".repeat(60)}\n`);

  // Show current exclusion stats
  const domainCount = db
    .prepare("SELECT COUNT(*) as count FROM exclusions WHERE type = 'domain'")
    .get().count;
  const emailCount = db
    .prepare("SELECT COUNT(*) as count FROM exclusions WHERE type = 'email'")
    .get().count;

  console.log(`Total exclusions in database:`);
  console.log(`  Domains: ${domainCount}`);
  console.log(`  Emails:  ${emailCount}\n`);

  console.log("✅ All city sheets imported successfully!");
  console.log("   These companies will now be skipped during prospecting.\n");
}

main().catch(console.error);
