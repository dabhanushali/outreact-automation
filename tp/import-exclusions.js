/**
 * Import Exclusions from Google Sheet CSV
 *
 * This script imports companies/domains/emails from your outreach tracker
 * into the exclusions table so they won't be processed again.
 */

import { db, initSchema } from "./src/database/db.js";

// Initialize database
initSchema();

// CSV data from Google Sheet
const csvData = `Website,Email,Response,1st Mail,Date,Follow up 1,Date
,info@webosmotic.com,,,"Hi,\nI hope you're doing well! My name is Arkan, and I'm reaching out from EnactOn Technologies, where we specialize in custom software development.\nI wanted to connect about a potential backlink collaboration.\nWe could either do a simple link exchange, where we swap links to support each other's websites, or we can contribute a guest post to your site, which could help drive more traffic.\nI believe this collaboration would be mutually beneficial in boosting visibility and domain authority for both of us.\nLet me know if you're open to exploring this, We would love to discuss it further!\nLooking forward to hearing from you.\nBest regards,\nMohammad Arkan\nDigital Marketing\nEnactOn | EnactSoft | ProposalBiz\n",Sent,"Hi,\nI hope you're doing well. I wanted to reach out again regarding the backlink collaboration opportunity.\nI believe this could be a great way to increase our visibility and domain authority, and I'm still very interested in exploring how we can work together through either a link exchange or a well-researched guest post.\nPlease let me know if you're open to discussing this further, or if you need any additional information.\nLooking forward to hearing from you!\nBest regards,\nMohammad Arkan\nDigital Marketing\nEnactOn | EnactSoft | ProposalBiz\n",14 Oct 2025
,info@webbycrown.com,,,Sent,,14 Oct 2025
,info@asthatechnology.com,,,Sent,,14 Oct 2025
,sassyinfotech@gmail.com,,,Sent,,14 Oct 2025
,advetflysolutions@gmail.com,,,Sent,,14 Oct 2025
,info@techgropse.com,,,Sent,,14 Oct 2025
,sales@vpninfotech.com,,,Sent,,14 Oct 2025
,info@xcellence-it.com,,,Sent,,14 Oct 2025
,parthikghce2008@gmail.com,,,Sent,,14 Oct 2025
,s.dobariya89@gmail.com,,,Sent,,14 Oct 2025
,hr@logictrixinfotech.com,,,Sent,,14 Oct 2025
,hr.nectarbits@gmail.com,,,Sent,,14 Oct 2025
,team@stackoverflow.com,,,Sent,,14 Oct 2025
,support@gitlab.com,,,Sent,,14 Oct 2025
,support@github.com,,,Sent,,14 Oct 2025
,info@techuz.com,,,Sent,,14 Oct 2025
,solutions@bacancytechnology.com,,,Sent,,14 Oct 2025
,info@indianic.com,,,Sent,,14 Oct 2025
,info@techtic.com,,,Sent,,14 Oct 2025
,sales@spaceo.ca,,,Sent,,14 Oct 2025
,contact@iihglobal.com,,,Sent,,14 Oct 2025
,contact@hiddenbrains.com,,,Sent,,14 Oct 2025
,coffee@jetbro.in,,,Sent,,14 Oct 2025
,contact@silentinfotech.com,,,Sent,,14 Oct 2025
,contact@atharvasystem.com,,,Sent,,14 Oct 2025
,sales@amarinfotech.com,,,Sent,,14 Oct 2025
,info@gujaratinfotech.com,,,Sent,,14 Oct 2025
,contact@nimblechapps.com,,,Sent,,14 Oct 2025
,contact@prismetric.com,,,Sent,,14 Oct 2025
,support@webkul.com,,,Sent,,14 Oct 2025
,help@dhiwise.com,,,Sent,,14 Oct 2025
,sales@enercomp.in,,,Sent,,14 Oct 2025
,sales@webelight.co.in,,,Sent,,14 Oct 2025
,contact@peoniesdigital.com,,,Sent,,14 Oct 2025
,info@argusoft.com,,,Sent,,14 Oct 2025
,navkartechnosoft@gmail.com,,,Sent,,14 Oct 2025
,babisarafaraz@gmail.com,,,Sent,,14 Oct 2025
,contact@zluck.com,,,Sent,,14 Oct 2025
,info@settingsinfotech.com,,,Sent,,14 Oct 2025
,info@technoguideinfo.com,,,Sent,,14 Oct 2025
,sales@trootech.com,"Started Conversation\nnirajjagwani.trootech2022@gmail.com\nmohit.hingu@trootech.com",,Sent,,14 Oct 2025
,info@brainvire.com,,,Sent,,14 Oct 2025
,raindropsinc@gmail.com,,,Sent,,14 Oct 2025
,biz@cmarix.com,,,Sent,,14 Oct 2025
,hello@simform.com,,,Sent,,14 Oct 2025
,sales@techgropse.com,,,Sent,,14 Oct 2025
,business@techtic.com,,,Sent,,14 Oct 2025
,sales@elsner.com,,,Sent,,14 Oct 2025
,business@infibeam.com,,,Sent,,14 Oct 2025
,harsh@shoutmeloud.com,,,Sent,,14 Oct 2025
,geno@amnavigator.com,,,Sent,,14 Oct 2025
,loren@searchenginejournal.com,,,Sent,,14 Oct 2025
,partners@livechat.com,,,Sent,,14 Oct 2025
,support@postaffiliatepro.com,,,Sent,,14 Oct 2025
,sales@partnerize.com,,,Sent,,14 Oct 2025
,support@affiliatewp.com,,,Sent,,14 Oct 2025
,support@leaddyno.com,,,Sent,,14 Oct 2025
,support@thirstyaffiliates.com,,,Sent,,14 Oct 2025
,publishersupport@sovrn.com,,,Sent,,14 Oct 2025
,partners@joinpiggy.com,,,Sent,,14 Oct 2025
,press@topcashback.com,,,Sent,,14 Oct 2025
,affiliates@fiverr.com,,,8 Oct 2025,,14 Oct 2025
,support@clickfunnels.com,,,8 Oct 2025,,14 Oct 2025
,affiliates@shopify.com,,,8 Oct 2025,,14 Oct 2025
,affiliates@bigcommerce.com,,,8 Oct 2025,,14 Oct 2025
,partners@woocommerce.com,,,8 Oct 2025,,14 Oct 2025
,syed@wpbeginner.com,,,8 Oct 2025,,14 Oct 2025
,press@buffer.com,,,8 Oct 2025,,14 Oct 2025
,press@skimlinks.com,,,8 Oct 2025,,14 Oct 2025
,research@g2.com,,,8 Oct 2025,,14 Oct 2025
,marketing@clutch.co,,,8 Oct 2025,,14 Oct 2025
,press@moz.com,,,8 Oct 2025,,14 Oct 2025
,support@ahrefs.com,,,8 Oct 2025,,14 Oct 2025
,press@teads.com,,,8 Oct 2025,,14 Oct 2025
,contact@yudiz.com,,,8 Oct 2025,,14 Oct 2025
,sales@openxcell.com,,,8 Oct 2025,,14 Oct 2025
,hello@moweb.com,,,8 Oct 2025,,14 Oct 2025
,info@simform.com,,,8 Oct 2025,,14 Oct 2025
,contact@shivlab.com,,,8 Oct 2025,,14 Oct 2025
,sales@mindinventory.com,,,8 Oct 2025,,14 Oct 2025
,sales@spaceotechnologies.com,,,8 Oct 2025,,14 Oct 2025
,info@siliconithub.com,,,8 Oct 2025,,14 Oct 2025
,hello@weboccult.com,,,8 Oct 2025,,14 Oct 2025
,info@multiqos.com,,,8 Oct 2025,,14 Oct 2025
,info@magnetoitsolutions.com,,,8 Oct 2025,,14 Oct 2025
,hello@marutitech.com,,,8 Oct 2025,,14 Oct 2025
,support@appjetty.com,,,8 Oct 2025,,14 Oct 2025
,info@dolphinwebsolution.com,,,8 Oct 2025,,14 Oct 2025
,sales@ecosmob.com,,,8 Oct 2025,,14 Oct 2025
,info@softqubes.com,,,8 Oct 2025,,14 Oct 2025
,contact@thirdrocktechkno.com,,,8 Oct 2025,,14 Oct 2025
,info@citrusbug.com,,,8 Oct 2025,,14 Oct 2025
,contact@codezeros.com,,,8 Oct 2025,,14 Oct 2025
,info@viitorcloud.com,,,8 Oct 2025,,14 Oct 2025
,info@pixlogix.com,,,8 Oct 2025,,14 Oct 2025
,info@theonetechnologies.com,,,8 Oct 2025,,14 Oct 2025
,info@web6.in,,,8 Oct 2025,,14 Oct 2025
,info@perceptionsystem.com,,,8 Oct 2025,,14 Oct 2025
,info@360technosoft.com,,,8 Oct 2025,,14 Oct 2025
,info@infilon.com,,,8 Oct 2025,,14 Oct 2025
,info@esparkinfo.com,,,8 Oct 2025,,14 Oct 2025
,info@smartfish.co.in,,,8 Oct 2025,,14 Oct 2025
,info@webapprise.com,,,8 Oct 2025,,14 Oct 2025
,info@wanbuffer.com,,,8 Oct 2025,,14 Oct 2025
,info@wayssofttech.com,,,8 Oct 2025,,14 Oct 2025
,hello@webbybutter.com,,,8 Oct 2025,,14 Oct 2025
,info@iboontechnologies.com,,,8 Oct 2025,,14 Oct 2025
,info@ysoftsolution.com,,,8 Oct 2025,,14 Oct 2025
,contact@avidbrio.com,,,8 Oct 2025,,14 Oct 2025
,info@itaims.com,,,8 Oct 2025,,14 Oct 2025
,info@xirainfotech.com,,,8 Oct 2025,,14 Oct 2025
,contact@ambitixtech.com,,,8 Oct 2025,,14 Oct 2025
,info@ksolves.com,,,8 Oct 2025,,14 Oct 2025
,sales@webcluesinfotech.com,,,8 Oct 2025,,14 Oct 2025
,info@mindinventory.com,,,8 Oct 2025,,14 Oct 2025
,info@intuz.com,,,8 Oct 2025,,14 Oct 2025
,info@softuvo.com,,,8 Oct 2025,,14 Oct 2025
,info@infoicontechnologies.com,,,8 Oct 2025,,14 Oct 2025
,info@codezeros.com,,,8 Oct 2025,,14 Oct 2025
,sales@mindbowser.com,,,8 Oct 2025,,14 Oct 2025
,hello@citrusleaf.in,,,8 Oct 2025,,14 Oct 2025
,info@probytes.net,,,8 Oct 2025,,14 Oct 2025
,info@datacrops.com,,,,,14 Oct 2025
,info@hiddenbrains.com,,,,,14 Oct 2025
,sales@wingstechsolutions.com,,,9 Oct 2025,,14 Oct 2025
,business@atharvasystem.com,,,9 Oct 2025,,14 Oct 2025
,info@enercomp.in,,,9 Oct 2025,,14 Oct 2025
,bugfree_solutions@yahoo.com,,,9 Oct 2025,,14 Oct 2025
,info@amuratech.com,,,9 Oct 2025,,14 Oct 2025
,info@evivve.com,,,9 Oct 2025,,14 Oct 2025
,info@calsoftinc.com,,,,
,info@infrasofttech.com,,,,
,connect@mindgate.in,,,,
,info@trunexa.com,,,,
,info@apar.com,,,,
,info@amuratech.com,,,,
,info@evivve.com,,,,
,info@sun-digital.com,,,,`;

// Parse CSV and extract exclusions
function parseCSV(csv) {
  const lines = csv.split('\n').slice(1); // Skip header
  const exclusions = {
    domains: new Set(),
    emails: new Set()
  };

  for (const line of lines) {
    // Simple CSV parsing (split by comma, handle quoted strings)
    const matches = line.match(/("([^"]*)"|[^,]+)/g);
    if (!matches || matches.length < 2) continue;

    const website = matches[0].replace(/"/g, '').trim();
    const email = matches[1].replace(/"/g, '').trim();

    // Extract domain from email
    if (email && email.includes('@')) {
      const domain = email.split('@')[1].toLowerCase().trim();
      if (domain) {
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

// Import into database
function importExclusions(exclusions) {
  const insertDomain = db.prepare(`
    INSERT OR IGNORE INTO exclusions (type, value, reason)
    VALUES ('domain', ?, 'Already reached out - imported from Google Sheet')
  `);

  const insertEmail = db.prepare(`
    INSERT OR IGNORE INTO exclusions (type, value, reason)
    VALUES ('email', ?, 'Already reached out - imported from Google Sheet')
  `);

  let domainCount = 0;
  let emailCount = 0;

  // Import domains in transaction
  const importDomains = db.transaction((domains) => {
    for (const domain of domains) {
      try {
        insertDomain.run(domain);
        domainCount++;
      } catch (error) {
        // Ignore duplicates
      }
    }
  });

  // Import emails in transaction
  const importEmails = db.transaction((emails) => {
    for (const email of emails) {
      try {
        insertEmail.run(email);
        emailCount++;
      } catch (error) {
        // Ignore duplicates
      }
    }
  });

  importDomains(exclusions.domains);
  importEmails(exclusions.emails);

  return { domainCount, emailCount };
}

// Main execution
console.log(`
╔════════════════════════════════════════════════════════════╗
║     IMPORTING EXCLUSIONS FROM GOOGLE SHEET                 ║
╚════════════════════════════════════════════════════════════╝
`);

const exclusions = parseCSV(csvData);

console.log(`Found ${exclusions.domains.length} unique domains`);
console.log(`Found ${exclusions.emails.length} unique emails`);
console.log(`\nImporting into database...\n`);

const result = importExclusions(exclusions);

console.log(`\n✅ Import Complete!`);
console.log(`   - Added ${result.domainCount} domains to exclusions`);
console.log(`   - Added ${result.emailCount} emails to exclusions`);

// Show sample
console.log(`\n📋 Sample excluded domains:`);
exclusions.domains.slice(0, 10).forEach(d => console.log(`   - ${d}`));

if (exclusions.domains.length > 10) {
  console.log(`   ... and ${exclusions.domains.length - 10} more`);
}

console.log(`\n💡 These domains will now be skipped during:`);
console.log(`   - Google Search (city/keyword mode)`);
console.log(`   - Directory Scraping (Clutch/GoodFirms)`);
console.log(`   - Blog Discovery`);
console.log(`   - Email Extraction`);
