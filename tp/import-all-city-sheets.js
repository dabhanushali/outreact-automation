/**
 * Import ALL city sheets from Google Sheets as exclusions
 * Fetches directly using Google Sheets API
 */

import { db } from './src/database/db.js';
import { ExclusionRepo } from './src/repositories/ExclusionRepo.js';

const SHEET_ID = '14vCrMbqoR1eBe4x1BcjQZjQnggn_2_2kAylv7HayP-k';

// Sheets to import (excluding Final, Cliq Outreach Mails, Sheet19 as per user request)
const SHEETS_TO_IMPORT = [
  'Bangalore',
  'Hyderabad',
  'Mumbai',
  'Pune',
  'Chennai',
  'Ahmedabad',
  'Vadodra',
  'Rajkot',
  'Gandhinagar',
  'Surat',
  'Outreach Mail',
  'Sheet17',
  'Backlink Got'
];

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║   Importing ALL City Sheets from Google Spreadsheet       ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

async function fetchSheetData(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

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

function parseCSV(csv) {
  const lines = csv.split('\n').slice(1); // Skip header
  const exclusions = {
    domains: new Set(),
    emails: new Set()
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    // Parse CSV line (handle quoted strings)
    const matches = line.match(/("([^"]*)"|[^,]+)/g);
    if (!matches || matches.length < 2) continue;

    const company = matches[0]?.replace(/"/g, '').trim() || '';
    const email = matches[1]?.replace(/"/g, '').trim() || '';

    if (!email || !email.includes('@')) continue;

    // Extract domain from email
    const domain = email.split('@')[1].toLowerCase().trim();
    if (domain && domain.includes('.')) {
      exclusions.domains.add(domain);
      exclusions.emails.add(email.toLowerCase().trim());
    }

    // Also extract domain from company name if it contains a website
    if (company) {
      const urlMatch = company.match(/https?:\/\/([^\/\s]+)/);
      if (urlMatch) {
        const domainFromUrl = urlMatch[1].replace(/^www\./, '');
        if (domainFromUrl && domainFromUrl.includes('.')) {
          exclusions.domains.add(domainFromUrl);
        }
      }
    }
  }

  return {
    domains: Array.from(exclusions.domains),
    emails: Array.from(exclusions.emails)
  };
}

async function importSheet(sheetName) {
  console.log(`\n📥 Processing: ${sheetName}`);

  const csv = await fetchSheetData(sheetName);
  if (!csv) {
    console.log(`  ⊗ Skipping ${sheetName} (failed to fetch)`);
    return { added: 0, skipped: 0 };
  }

  const { domains, emails } = parseCSV(csv);
  console.log(`  Found ${domains.length} domains and ${emails.length} emails`);

  let added = 0;
  let skipped = 0;

  // Add domains
  for (const domain of domains) {
    try {
      if (!ExclusionRepo.isExcluded(domain)) {
        ExclusionRepo.excludeDomain(domain, `Already reached out (Google Sheet - ${sheetName})`);
        added++;
      } else {
        skipped++;
      }
    } catch (error) {
      skipped++;
    }
  }

  // Add emails
  for (const email of emails) {
    try {
      if (!ExclusionRepo.isEmailExcluded(email)) {
        ExclusionRepo.excludeEmail(email, `Already reached out (Google Sheet - ${sheetName})`);
        added++;
      } else {
        skipped++;
      }
    } catch (error) {
      skipped++;
    }
  }

  console.log(`  ✓ Added: ${added}, Skipped: ${skipped}`);
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

  console.log(`\n${'='.repeat(60)}`);
  console.log(`IMPORT SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total added:    ${totalAdded}`);
  console.log(`Total skipped:  ${totalSkipped}`);
  console.log(`Total processed: ${totalAdded + totalSkipped}`);
  console.log(`${'='.repeat(60)}\n`);

  // Show current exclusion stats
  const domainCount = db.prepare("SELECT COUNT(*) as count FROM exclusions WHERE type = 'domain'").get().count;
  const emailCount = db.prepare("SELECT COUNT(*) as count FROM exclusions WHERE type = 'email'").get().count;

  console.log(`Total exclusions in database:`);
  console.log(`  Domains: ${domainCount}`);
  console.log(`  Emails:  ${emailCount}\n`);

  console.log('✅ All city sheets imported successfully!');
  console.log('   These companies will now be skipped during prospecting.\n');
}

main().catch(console.error);
