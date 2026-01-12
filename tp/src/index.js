import { initSchema, db } from "./database/db.js";
import { InputParser } from "./services/InputParser.js";
import path from "path";

async function main() {
  console.log("--- Outreach System Node.js MVP ---");

  // 1. Init DB
  initSchema();

  // 2. Parse Inputs
  const docsDir = path.resolve("d:/OutReach/docs");

  try {
    InputParser.parseBlogSpecific(
      path.join(docsDir, "blog-specific approach.md")
    );
    InputParser.parseGeneral(path.join(docsDir, "general approach.md"));
  } catch (e) {
    console.error("Error parsing inputs:", e);
  }

  // 3. Execute Search (Example)
  const { SearchService } = await import("./services/SearchService.js");

  // Pick one campaign to test (preferably one with keywords)
  const testCampaign = db
    .prepare("SELECT id FROM campaigns WHERE keywords IS NOT NULL LIMIT 1")
    .get();
  if (testCampaign) {
    await SearchService.runCampaign(testCampaign.id);
  } else {
    console.log("No campaigns with keywords found.");
  }

  console.log("--- Workflow Complete ---");
}

main();
