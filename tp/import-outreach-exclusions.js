/**
 * Import Outreach Exclusions from Google Sheets CSV Exports
 *
 * Usage:
 * 1. Export each city sheet from Google Sheets as CSV
 * 2. Save them in the data/outreach-sheets/ directory
 * 3. Run: node import-outreach-exclusions.js
 *
 * This will add all the companies/domains/emails to the exclusions list
 */

import fs from 'fs';
import path from 'path';
import { db } from './src/database/db.js';
import { ExclusionRepo } from './src/repositories/ExclusionRepo.js';

const SHEETS_DIR = path.resolve('data/outreach-sheets');

// Ensure directory exists
if (!fs.existsSync(SHEETS_DIR)) {
  fs.mkdirSync(SHEETS_DIR, { recursive: true });
  console.log(`Created directory: ${SHEETS_DIR}`);
  console.log('\n⚠️  Please export your Google Sheets as CSV files and save them here:');
  console.log('   - Export sheets: Bangalore, Hyderabad, Mumbai, Pune, Chennai, etc.');
  console.log('   - DO NOT export: Final, Cliq Outreach Mails, Sheet19');
  console.log('   - Run this script again after adding the CSV files.\n');
  process.exit(0);
}

// Read all CSV files from the directory
const csvFiles = fs.readdirSync(SHEETS_DIR)
  .filter(file => file.endsWith('.csv'));

if (csvFiles.length === 0) {
  console.log('No CSV files found in data/outreach-sheets/');
  console.log('Please export your Google Sheets as CSV and save them there.');
  process.exit(0);
}

console.log(`\nFound ${csvFiles.length} CSV file(s) to process...\n`);

let totalAdded = 0;
let totalSkipped = 0;

// Parse CSV and extract exclusions
function parseOutreachCSV(csvContent, filename) {
  const lines = csvContent.split('\n').slice(1); // Skip header
  const exclusions = {
    domains: new Set(),
    emails: new Set()
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    // Simple CSV parsing - split by comma, handle basic quotes
    const matches = line.match(/("([^"]*)"|[^,]+)/g);
    if (!matches) continue;

    const website = matches[0]?.replace(/"/g, '').trim() || '';
    const email = matches[1]?.replace(/"/g, '').trim() || '';

    // Extract domain from email
    if (email && email.includes('@')) {
      const domain = email.split('@')[1].toLowerCase().trim();
      if (domain && domain.includes('.')) {
        exclusions.domains.add(domain);
        exclusions.emails.add(email.toLowerCase().trim());
      }
    }

    // Extract domain from website column
    if (website) {
      let domain = website.toLowerCase().trim();
      // Remove protocol and path
      domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      if (domain && domain.includes('.')) {
        exclusions.domains.add(domain);
      }
    }
  }

  return {
    domains: Array.from(exclusions.domains),
    emails: Array.from(exclusions.emails)
  };
}

// Process each CSV file
for (const file of csvFiles) {
  const filePath = path.join(SHEETS_DIR, file);
  console.log(`Processing: ${file}`);

  try {
    const csvContent = fs.readFileSync(filePath, 'utf-8');
    const { domains, emails } = parseOutreachCSV(csvContent, file);

    console.log(`  Found ${domains.length} domains and ${emails.length} emails`);

    // Add domains to exclusions
    for (const domain of domains) {
      try {
        if (!ExclusionRepo.isExcluded(domain)) {
          ExclusionRepo.excludeDomain(domain, `Already reached out (from ${file})`);
          totalAdded++;
        } else {
          totalSkipped++;
        }
      } catch (error) {
        // Skip duplicates
        totalSkipped++;
      }
    }

    // Add emails to exclusions
    for (const email of emails) {
      try {
        if (!ExclusionRepo.isEmailExcluded(email)) {
          ExclusionRepo.excludeEmail(email, `Already reached out (from ${file})`);
          totalAdded++;
        } else {
          totalSkipped++;
        }
      } catch (error) {
        // Skip duplicates
        totalSkipped++;
      }
    }

    console.log(`  ✓ Processed ${file}`);
  } catch (error) {
    console.error(`  ✗ Error processing ${file}:`, error.message);
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`IMPORT SUMMARY`);
console.log(`${'='.repeat(60)}`);
console.log(`Total added:    ${totalAdded}`);
console.log(`Total skipped:  ${totalSkipped}`);
console.log(`${'='.repeat(60)}\n`);

// Show current exclusion stats
const domainCount = db.prepare('SELECT COUNT(*) as count FROM exclusions WHERE type = "domain"').get().count;
const emailCount = db.prepare('SELECT COUNT(*) as count FROM exclusions WHERE type = "email"').get().count;

console.log(`Current exclusions in database:`);
console.log(`  Domains: ${domainCount}`);
console.log(`  Emails:  ${emailCount}\n`);
