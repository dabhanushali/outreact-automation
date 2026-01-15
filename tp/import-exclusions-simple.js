/**
 * Import Exclusions from Google Sheet
 * Simple script to import already-contacted companies
 */

import { db, initSchema } from "./src/database/db.js";

// Initialize database
initSchema();

// Emails extracted from the Google Sheet
const emails = [
  'info@webosmotic.com', 'info@webbycrown.com', 'info@asthatechnology.com',
  'sassyinfotech@gmail.com', 'advetflysolutions@gmail.com', 'info@techgropse.com',
  'sales@techgropse.com', 'sales@vpninfotech.com', 'info@xcellence-it.com',
  'parthikghce2008@gmail.com', 's.dobariya89@gmail.com', 'hr@logictrixinfotech.com',
  'hr.nectarbits@gmail.com', 'team@stackoverflow.com', 'support@gitlab.com',
  'support@github.com', 'info@techuz.com', 'solutions@bacancytechnology.com',
  'info@indianic.com', 'info@techtic.com', 'business@techtic.com',
  'sales@spaceo.ca', 'contact@iihglobal.com', 'contact@hiddenbrains.com',
  'coffee@jetbro.in', 'contact@silentinfotech.com', 'contact@atharvasystem.com',
  'business@atharvasystem.com', 'sales@amarinfotech.com', 'info@gujaratinfotech.com',
  'contact@nimblechapps.com', 'contact@prismetric.com', 'support@webkul.com',
  'help@dhiwise.com', 'sales@enercomp.in', 'info@enercomp.in',
  'sales@webelight.co.in', 'contact@peoniesdigital.com', 'info@argusoft.com',
  'navkartechnosoft@gmail.com', 'babisarafaraz@gmail.com', 'contact@zluck.com',
  'info@settingsinfotech.com', 'info@technoguideinfo.com', 'sales@trootech.com',
  'info@brainvire.com', 'raindropsinc@gmail.com', 'biz@cmarix.com',
  'hello@simform.com', 'sales@elsner.com', 'business@infibeam.com',
  'harsh@shoutmeloud.com', 'geno@amnavigator.com', 'loren@searchenginejournal.com',
  'partners@livechat.com', 'support@postaffiliatepro.com', 'sales@partnerize.com',
  'support@affiliatewp.com', 'support@leaddyno.com', 'support@thirstyaffiliates.com',
  'publishersupport@sovrn.com', 'partners@joinpiggy.com', 'press@topcashback.com',
  'affiliates@fiverr.com', 'support@clickfunnels.com', 'affiliates@shopify.com',
  'affiliates@bigcommerce.com', 'partners@woocommerce.com', 'syed@wpbeginner.com',
  'press@buffer.com', 'press@skimlinks.com', 'research@g2.com',
  'marketing@clutch.co', 'press@moz.com', 'support@ahrefs.com',
  'press@teads.com', 'contact@yudiz.com', 'sales@openxcell.com',
  'hello@moweb.com', 'contact@shivlab.com', 'sales@mindinventory.com',
  'sales@spaceotechnologies.com', 'info@siliconithub.com', 'hello@weboccult.com',
  'info@multiqos.com', 'info@magnetoitsolutions.com', 'hello@marutitech.com',
  'support@appjetty.com', 'info@dolphinwebsolution.com', 'sales@ecosmob.com',
  'info@softqubes.com', 'contact@thirdrocktechkno.com', 'info@citrusbug.com',
  'contact@codezeros.com', 'info@viitorcloud.com', 'info@pixlogix.com',
  'info@theonetechnologies.com', 'info@web6.in', 'info@perceptionsystem.com',
  'info@360technosoft.com', 'info@infilon.com', 'info@esparkinfo.com',
  'info@smartfish.co.in', 'info@webapprise.com', 'info@wanbuffer.com',
  'info@wayssofttech.com', 'hello@webbybutter.com', 'info@iboontechnologies.com',
  'info@ysoftsolution.com', 'contact@avidbrio.com', 'info@itaims.com',
  'info@xirainfotech.com', 'contact@ambitixtech.com', 'info@ksolves.com',
  'sales@webcluesinfotech.com', 'info@intuz.com', 'info@softuvo.com',
  'info@infoicontechnologies.com', 'sales@mindbowser.com', 'hello@citrusleaf.in',
  'info@probytes.net', 'info@datacrops.com', 'sales@wingstechsolutions.com',
  'bugfree_solutions@yahoo.com', 'info@amuratech.com', 'info@evivve.com',
  'info@calsoftinc.com', 'info@infrasofttech.com', 'connect@mindgate.in',
  'info@trunexa.com', 'info@apar.com', 'info@sun-digital.com'
];

// Extract domains from emails
function extractDomains(emails) {
  const domains = new Set();
  for (const email of emails) {
    const domain = email.split('@')[1];
    if (domain) {
      domains.add(domain);
    }
  }
  return Array.from(domains);
}

// Import into database
function importExclusions() {
  const insertDomain = db.prepare(`
    INSERT OR IGNORE INTO exclusions (type, value, reason)
    VALUES ('domain', ?, 'Already reached out - imported from Google Sheet')
  `);

  const insertEmail = db.prepare(`
    INSERT OR IGNORE INTO exclusions (type, value, reason)
    VALUES ('email', ?, 'Already reached out - imported from Google Sheet')
  `);

  const domains = extractDomains(emails);

  let domainCount = 0;
  let emailCount = 0;

  // Import in transaction
  const importDomains = db.transaction((domainList) => {
    for (const domain of domainList) {
      insertDomain.run(domain);
      domainCount++;
    }
  });

  const importEmails = db.transaction((emailList) => {
    for (const email of emailList) {
      insertEmail.run(email);
      emailCount++;
    }
  });

  importDomains(domains);
  importEmails(emails);

  return { domainCount, emailCount, totalDomains: domains.length };
}

// Main execution
console.log(`
╔════════════════════════════════════════════════════════════╗
║     IMPORTING EXCLUSIONS FROM GOOGLE SHEET                 ║
╚════════════════════════════════════════════════════════════╝
`);

console.log(`Found ${emails.length} emails`);
console.log(`Extracted ${extractDomains(emails).length} unique domains`);
console.log(`\nImporting into database...\n`);

const result = importExclusions();

console.log(`\n✅ Import Complete!`);
console.log(`   - Added ${result.domainCount} domains to exclusions`);
console.log(`   - Added ${result.emailCount} emails to exclusions`);

// Show sample
console.log(`\n📋 Sample excluded domains:`);
extractDomains(emails).slice(0, 10).forEach(d => console.log(`   - ${d}`));

console.log(`\n💡 These domains/emails will now be skipped during:`);
console.log(`   - Google Search (city/keyword mode)`);
console.log(`   - Directory Scraping (Clutch/GoodFirms)`);
console.log(`   - Blog Discovery`);
console.log(`   - Email Extraction`);
