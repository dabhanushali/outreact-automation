/**
 * Backlink Outreach System - Main Entry Point
 *
 * Usage:
 *   node run-outreach.js                         - Interactive mode
 *   node run-outreach.js --mode city              - City search mode
 *   node run-outreach.js --mode directory         - Directory scraping mode
 *   node run-outreach.js --mode queries           - Search queries from DB
 *   node run-outreach.js --mode blog              - Blog discovery mode
 *   node run-outreach.js --mode extract-emails    - Email extraction mode (companies)
 *   node run-outreach.js --mode extract-blog-emails - Email extraction mode (blogs)
 *   node run-outreach.js --stats                  - Show daily stats
 *   node run-outreach.js --reset                  - Reset daily stats
 */

import { initSchema, db } from "./src/database/db.js";
import { InputParser } from "./src/services/InputParser.js";
import { OutreachOrchestrator } from "./src/services/OutreachOrchestrator.js";
import { DailyLimitService } from "./src/services/DailyLimitService.js";
import { DirectoryScraperService } from "./src/services/DirectoryScraperService.js";
import { BrandRepo } from "./src/repositories/BrandRepo.js";
import { CampaignRepo } from "./src/repositories/CampaignRepo.js";
import path from "path";
import readline from "readline";

// Parse command line args
const args = process.argv.slice(2);

// Helper to parse --flag=value or --flag value
function parseArg(flagName) {
  const flagIndex = args.findIndex((a) => a === `--${flagName}`);
  if (flagIndex !== -1 && args[flagIndex + 1]) {
    return args[flagIndex + 1];
  }
  const flagEqual = args.find((a) => a.startsWith(`--${flagName}=`));
  if (flagEqual) {
    return flagEqual.split("=")[1];
  }
  return null;
}

// Parse --mode=value or --mode value
let modeFlag = parseArg('mode');

const statsFlag = args.includes("--stats");
const resetFlag = args.includes("--reset");

// Additional arguments for non-interactive mode
const cityArg = parseArg('city');
const directoryArg = parseArg('directory');
const limitArg = parseArg('limit');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║          BACKLINK OUTREAUT SYSTEM v2.0                       ║
║     Discovery → Verification → Email Extraction              ║
╚══════════════════════════════════════════════════════════════╝
`);

  // 1. Initialize Database
  console.log("Initializing database...");
  initSchema();

  // 2. Handle stats command
  if (statsFlag) {
    DailyLimitService.printStats();

    // Show breakdown by status
    const statusBreakdown = db
      .prepare(
        `
        SELECT status, COUNT(*) as count
        FROM leads
        WHERE DATE(found_at) = DATE('now')
        GROUP BY status
      `
      )
      .all();

    console.log(`\nLeads Added Today by Status:`);
    for (const row of statusBreakdown) {
      console.log(`  ${row.status}: ${row.count}`);
    }
    process.exit(0);
  }

  // 3. Handle reset command
  if (resetFlag) {
    const confirm = await question(
      "Are you sure you want to reset today's stats? (yes/no): "
    );
    if (confirm.toLowerCase() === "yes") {
      DailyLimitService.resetToday();
    } else {
      console.log("Reset cancelled.");
    }
    process.exit(0);
  }

  // 4. Parse input files (for brands/campaigns)
  const docsDir = path.resolve("d:/OutReach/docs");
  try {
    InputParser.parseBlogSpecific(
      path.join(docsDir, "blog-specific approach.md")
    );
    InputParser.parseGeneral(path.join(docsDir, "general approach.md"));
  } catch (e) {
    console.log("Note: Input parsing skipped (files may not exist)");
  }

  // 5. Ensure we have a brand and campaign
  let brandId = db.prepare("SELECT id FROM brands LIMIT 1").get()?.id;
  let campaignId = db.prepare("SELECT id FROM campaigns LIMIT 1").get()?.id;

  if (!brandId) {
    console.log("Creating default brand...");
    brandId = BrandRepo.findOrCreate("Outreach System", "https://example.com");
  }

  if (!campaignId) {
    console.log("Creating default campaign...");
    campaignId = CampaignRepo.create(brandId, "General Outreach", null, []);
  }

  console.log(`\nUsing Brand ID: ${brandId}, Campaign ID: ${campaignId}`);

  // 6. Determine mode
  let mode = modeFlag;

  // Debug: show detected mode
  if (modeFlag) {
    console.log(`Mode detected from command line: ${modeFlag}\n`);
  }

  if (!mode) {
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    SELECT MODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. City Search Mode          - Search Google for "software development [city]"
  2. Directory Scraping Mode   - Scrape Clutch.co / GoodFirms listings
  3. Database Queries Mode     - Use search_queries from database
  4. Blog Discovery Mode       - Search for campaign-specific blog assets
  5. Extract Emails           - Extract emails for newly added company prospects
  6. Extract Blog Emails      - Extract emails for newly added blog prospects
  7. Show Daily Stats
  8. Exit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

    mode = await question("Enter choice (1-8): ");
  }

  try {
    switch (mode) {
      case "1":
      case "city":
        // City Search Mode
        let city = cityArg;
        if (!city) {
          city = await question("Enter city name (e.g., Bangalore): ");
        } else {
          console.log(`Using city: ${city}`);
        }
        await OutreachOrchestrator.runCitySearch(city, brandId, campaignId);
        break;

      case "2":
      case "directory":
        // Directory Scraping Mode
        const allDirs = DirectoryScraperService.getDirectoryUrls();

        let dirChoice = directoryArg;

        if (!dirChoice) {
          console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    SELECT DIRECTORIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. Clutch - India (10 cities)
  2. Clutch - USA (8 cities)
  3. Clutch - UK (6 cities)
  4. Clutch - Canada (5 cities)
  5. Clutch - Australia (5 cities)
  6. GoodFirms - India (8 cities)
  7. GoodFirms - USA (6 cities)
  8. GoodFirms - UK (3 cities)
  9. GoodFirms - Canada (2 cities)
 10. All Clutch directories (34 total)
 11. All GoodFirms directories (19 total)
 12. Custom URL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

          dirChoice = await question("Enter choice (1-12): ");
        } else {
          console.log(`Using directory choice: ${dirChoice}`);
        }

        let dirUrls = [];

        switch (dirChoice) {
          case "1":
            dirUrls = allDirs.clutch.filter((u) => u.includes("/in/"));
            break;
          case "2":
            dirUrls = allDirs.clutch.filter((u) => u.includes("/us/"));
            break;
          case "3":
            dirUrls = allDirs.clutch.filter(
              (u) => u.includes(".uk") || u.includes("/uk/")
            );
            break;
          case "4":
            dirUrls = allDirs.clutch.filter((u) => u.includes("/ca/"));
            break;
          case "5":
            dirUrls = allDirs.clutch.filter(
              (u) => u.includes(".au") || u.includes("/au/")
            );
            break;
          case "6":
            dirUrls = allDirs.goodfirms.filter((u) => u.includes("/india/"));
            break;
          case "7":
            dirUrls = allDirs.goodfirms.filter((u) => u.includes("/usa/"));
            break;
          case "8":
            dirUrls = allDirs.goodfirms.filter((u) => u.includes("/uk/"));
            break;
          case "9":
            dirUrls = allDirs.goodfirms.filter((u) => u.includes("/canada/"));
            break;
          case "10":
            dirUrls = allDirs.clutch;
            break;
          case "11":
            dirUrls = allDirs.goodfirms;
            break;
          case "12":
            const customUrl = await question("Enter directory URL: ");
            dirUrls = [customUrl];
            break;
          default:
            console.log("Invalid choice. Using default: India (Clutch)");
            dirUrls = allDirs.clutch.filter((u) => u.includes("/in/"));
        }

        console.log(`\nWill scrape ${dirUrls.length} directory page(s)...`);
        await OutreachOrchestrator.runDirectoryScraping(
          dirUrls,
          brandId,
          campaignId
        );
        break;

      case "3":
      case "queries":
        // Database Queries Mode
        let limit = limitArg || "10";
        if (!limitArg) {
          const limitInput = await question("How many queries to process? (default: 10): ");
          limit = limitInput || "10";
        } else {
          console.log(`Processing ${limit} queries`);
        }
        await OutreachOrchestrator.runFromSearchQueries(parseInt(limit));
        break;

      case "4":
      case "blog":
        // Blog Specific Discovery Mode
        await OutreachOrchestrator.runBlogDiscovery();
        break;

      case "5":
      case "extract-emails":
        // Email Extraction Mode (company prospects)
        await OutreachOrchestrator.extractEmailsForNewProspects();
        break;

      case "6":
      case "extract-blog-emails":
        // Blog Email Extraction Mode
        await OutreachOrchestrator.extractEmailsForBlogProspects();
        break;

      case "7":
      case "stats":
        DailyLimitService.printStats();
        break;

      case "8":
      case "exit":
        console.log("Goodbye!");
        break;

      default:
        console.log("Invalid choice. Exiting.");
    }
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    // Cleanup
    console.log("\nCleaning up...");
    await OutreachOrchestrator.cleanup();
    rl.close();
  }
}

main().catch(console.error);
