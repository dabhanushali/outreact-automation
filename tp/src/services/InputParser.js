import fs from "fs";
import path from "path";
import { BrandRepo } from "../repositories/BrandRepo.js";
import { CampaignRepo } from "../repositories/CampaignRepo.js";

export class InputParser {
  static parseBlogSpecific(filePath) {
    console.log(`Parsing Blog Specific File: ${filePath}`);
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").map((l) => l.trim());

    let currentBrandId = null;
    let currentCampaignId = null;
    let capturingKeywords = false;
    let currentKeywords = [];

    // Helper to save pending keywords
    const savePendingKeywords = () => {
      if (currentCampaignId && currentKeywords.length > 0) {
        CampaignRepo.updateKeywords(currentCampaignId, currentKeywords);
        console.log(
          `    Saved ${currentKeywords.length} keywords for campaign ${currentCampaignId}.`
        );
        currentKeywords = [];
      }
    };

    // Check first line manually
    if (lines.length > 0) {
      const firstLine = lines[0].replace(/^#+\s*/, "").trim(); // Remove markdown # prefix
      if (
        firstLine.toUpperCase() === firstLine &&
        firstLine.length > 2 &&
        !firstLine.includes("http")
      ) {
        console.log(`Found Brand (Header): ${firstLine}`);
        currentBrandId = BrandRepo.findOrCreate(firstLine);
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Check for brand header (with or without ## prefix)
      const cleanedLine = line.replace(/^#+\s*/, "").trim();
      if (
        cleanedLine.length > 0 &&
        cleanedLine.toUpperCase() === cleanedLine &&
        cleanedLine.length > 2 &&
        cleanedLine.length < 30 && // Reasonable brand name length
        !cleanedLine.includes("http") &&
        !cleanedLine.includes("Where") &&
        cleanedLine !== "KEYWORDS" &&
        !cleanedLine.includes("rotates through") &&
        !cleanedLine.match(/^[-]+$/) // Not just dashes
      ) {
        // This is a brand header
        savePendingKeywords();
        console.log(`Found Brand: ${cleanedLine}`);
        currentBrandId = BrandRepo.findOrCreate(cleanedLine);
        currentCampaignId = null;
        capturingKeywords = false;
        currentKeywords = [];
        continue;
      }

      // Check for Separator followed by Brand (format: ------------\nBRAND\n------------)
      if (line.match(/^[-]{3,}$/)) {
        // End of block -> Save pending work
        savePendingKeywords();

        // Reset Campaign Context
        capturingKeywords = false;
        currentCampaignId = null;

        // Check next valid line for Brand (pattern: dashes, brand, dashes)
        if (i + 2 < lines.length) {
          const next = lines[i + 1];
          const afterNext = lines[i + 2];
          if (
            next &&
            !next.match(/^[-]{3,}$/) &&
            !next.includes("http") &&
            next.length > 1 &&
            next.length < 50 &&
            afterNext &&
            afterNext.match(/^[-]{3,}$/)
          ) {
            console.log(`Found Brand (Block format): ${next}`);
            currentBrandId = BrandRepo.findOrCreate(next);
            i += 2; // Skip the brand name and the closing dashes
            continue;
          }
        }

        // Check for format: dashes, brand (no closing dashes, then empty or URL)
        if (i + 1 < lines.length) {
          const next = lines[i + 1];
          if (
            next &&
            !next.match(/^[-]{3,}$/) &&
            !next.includes("http") &&
            next.length > 1 &&
            next.length < 50
          ) {
            const afterNext = i + 2 < lines.length ? lines[i + 2] : null;
            if (!afterNext || afterNext === "" || afterNext.startsWith("http")) {
              console.log(`Found Brand (Section format): ${next}`);
              currentBrandId = BrandRepo.findOrCreate(next);
              i += 1;
              continue;
            }
          }
        }
        continue;
      }

      // Check for Campaign URL
      if (currentBrandId && line.startsWith("http")) {
        savePendingKeywords();

        const url = line;
        const slug =
          url
            .split("/")
            .filter((x) => x)
            .pop() || "home";
        const name = `Blog: ${slug}`;

        // Create (or find) and set as current
        const existing = CampaignRepo.findByUrl(currentBrandId, url);
        if (!existing) {
          console.log(`  Found Campaign: ${name}`);
          currentCampaignId = CampaignRepo.create(
            currentBrandId,
            name,
            url,
            []
          );
        } else {
          currentCampaignId = existing.id;
        }

        capturingKeywords = false; // Reset until we hit the keyword marker
        continue;
      }

      // Check for Keyword Block Start
      if (currentCampaignId && line.toLowerCase().includes("rotates through")) {
        capturingKeywords = true;
        continue;
      }

      // Capture Keywords
      if (capturingKeywords && currentCampaignId) {
        if (line.length > 2 && !line.includes("-----")) {
          currentKeywords.push(line);
        }
      }
    }

    // Save last batch at EOF
    savePendingKeywords();
  }

  static parseGeneral(filePath) {
    console.log(`Parsing General Approach: ${filePath}`);
    const brandId = BrandRepo.findOrCreate(
      "Agency Outreach",
      "https://agency.com"
    );
    CampaignRepo.findOrCreate(brandId, "Global City Search");
    console.log("  Created General 'Global City Search' Campaign.");
  }
}
