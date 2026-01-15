/**
 * Direct import of exclusions from the Google Sheet
 * This script processes the "Final" sheet data and adds exclusions
 */

import { db } from './src/database/db.js';
import { ExclusionRepo } from './src/repositories/ExclusionRepo.js';

// Companies from the Google Sheet "Final" tab
const outreachData = [
  { email: 'info@webosmotic.com' },
  { email: 'info@webbycrown.com' },
  { email: 'info@asthatechnology.com' },
  { email: 'sassyinfotech@gmail.com' },
  { email: 'advetflysolutions@gmail.com' },
  { email: 'info@techgropse.com' },
  { email: 'sales@vpninfotech.com' },
  { email: 'info@xcellence-it.com' },
  { email: 'parthikghce2008@gmail.com' },
  { email: 's.dobariya89@gmail.com' },
  { email: 'hr@logictrixinfotech.com' },
  { email: 'hr.nectarbits@gmail.com' },
  { email: 'team@stackoverflow.com' },
  { email: 'support@gitlab.com' },
  { email: 'support@github.com' },
  { email: 'info@techuz.com' },
  { email: 'solutions@bacancytechnology.com' },
  { email: 'info@indianic.com' },
  { email: 'info@techtic.com' },
  { email: 'sales@spaceo.ca' },
  { email: 'contact@iihglobal.com' },
  { email: 'contact@hiddenbrains.com' },
  { email: 'coffee@jetbro.in' },
  { email: 'contact@silentinfotech.com' },
  { email: 'contact@atharvasystem.com' },
  { email: 'sales@amarinfotech.com' },
  { email: 'info@gujaratinfotech.com' },
  { email: 'contact@nimblechapps.com' },
  { email: 'contact@prismetric.com' },
  { email: 'support@webkul.com' },
  { email: 'help@dhiwise.com' },
  { email: 'sales@enercomp.in' },
  { email: 'sales@webelight.co.in' },
  { email: 'contact@peoniesdigital.com' },
  { email: 'info@argusoft.com' },
  { email: 'navkartechnosoft@gmail.com' },
  { email: 'babisarafaraz@gmail.com' },
  { email: 'contact@zluck.com' },
  { email: 'info@settingsinfotech.com' },
  { email: 'info@technoguideinfo.com' },
  { email: 'sales@trootech.com' },
  { email: 'info@brainvire.com' },
  { email: 'raindropsinc@gmail.com' },
  { email: 'biz@cmarix.com' },
  { email: 'hello@simform.com' },
  { email: 'sales@techgropse.com' },
  { email: 'business@techtic.com' },
  { email: 'sales@elsner.com' },
  { email: 'business@infibeam.com' },
  { email: 'harsh@shoutmeloud.com' },
  { email: 'geno@amnavigator.com' },
  { email: 'loren@searchenginejournal.com' },
  { email: 'partners@livechat.com' },
  { email: 'support@postaffiliatepro.com' },
  { email: 'sales@partnerize.com' },
  { email: 'support@affiliatewp.com' },
  { email: 'support@leaddyno.com' },
  { email: 'support@thirstyaffiliates.com' },
  { email: 'publishersupport@sovrn.com' },
  { email: 'partners@joinpiggy.com' },
  { email: 'press@topcashback.com' },
  { email: 'affiliates@fiverr.com' },
  { email: 'support@clickfunnels.com' },
  { email: 'affiliates@shopify.com' },
  { email: 'affiliates@bigcommerce.com' },
  { email: 'partners@woocommerce.com' },
  { email: 'syed@wpbeginner.com' },
  { email: 'press@buffer.com' },
  { email: 'press@skimlinks.com' },
  { email: 'research@g2.com' },
  { email: 'marketing@clutch.co' },
  { email: 'press@moz.com' },
  { email: 'support@ahrefs.com' },
  { email: 'press@teads.com' },
  { email: 'contact@yudiz.com' },
  { email: 'sales@openxcell.com' },
  { email: 'hello@moweb.com' },
  { email: 'info@simform.com' },
  { email: 'contact@shivlab.com' },
  { email: 'sales@mindinventory.com' },
  { email: 'sales@spaceotechnologies.com' },
  { email: 'info@siliconithub.com' },
  { email: 'hello@weboccult.com' },
  { email: 'info@multiqos.com' },
  { email: 'info@magnetoitsolutions.com' },
  { email: 'hello@marutitech.com' },
  { email: 'support@appjetty.com' },
  { email: 'info@dolphinwebsolution.com' },
  { email: 'sales@ecosmob.com' },
  { email: 'info@softqubes.com' },
  { email: 'contact@thirdrocktechkno.com' },
  { email: 'info@citrusbug.com' },
  { email: 'contact@codezeros.com' },
  { email: 'info@viitorcloud.com' },
  { email: 'info@pixlogix.com' },
  { email: 'info@theonetechnologies.com' },
  { email: 'info@web6.in' },
  { email: 'info@perceptionsystem.com' },
  { email: 'info@360technosoft.com' }
];

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║     Importing Outreach Exclusions from Google Sheet      ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

let emailsAdded = 0;
let domainsAdded = 0;
let skipped = 0;

for (const item of outreachData) {
  const email = item.email?.toLowerCase().trim();

  if (!email || !email.includes('@')) {
    continue;
  }

  // Extract domain from email
  const domain = email.split('@')[1].toLowerCase().trim();

  // Add email to exclusions
  try {
    if (!ExclusionRepo.isEmailExcluded(email)) {
      ExclusionRepo.excludeEmail(email, 'Already reached out (Google Sheet - Final tab)');
      emailsAdded++;
      console.log(`  ✓ Added email: ${email}`);
    } else {
      skipped++;
      console.log(`  ⊗ Skipped (already exists): ${email}`);
    }
  } catch (error) {
    // Likely a duplicate
    skipped++;
  }

  // Add domain to exclusions
  try {
    if (!ExclusionRepo.isExcluded(domain)) {
      ExclusionRepo.excludeDomain(domain, 'Already reached out (Google Sheet - Final tab)');
      domainsAdded++;
      console.log(`  ✓ Added domain: ${domain}`);
    }
  } catch (error) {
    // Likely a duplicate
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`IMPORT SUMMARY`);
console.log(`${'='.repeat(60)}`);
console.log(`Emails added:   ${emailsAdded}`);
console.log(`Domains added:  ${domainsAdded}`);
console.log(`Total skipped:  ${skipped}`);
console.log(`${'='.repeat(60)}\n`);

// Show current exclusion stats
const domainCount = db.prepare("SELECT COUNT(*) as count FROM exclusions WHERE type = 'domain'").get().count;
const emailCount = db.prepare("SELECT COUNT(*) as count FROM exclusions WHERE type = 'email'").get().count;

console.log(`Total exclusions in database:`);
console.log(`  Domains: ${domainCount}`);
console.log(`  Emails:  ${emailCount}\n`);

console.log('✅ Import complete! These companies will now be skipped during:');
console.log('   - City search');
console.log('   - Directory scraping');
console.log('   - Blog discovery');
console.log('   - Email extraction\n');
