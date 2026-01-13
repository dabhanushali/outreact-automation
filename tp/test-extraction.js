import { DirectoryScraperService } from "./src/services/DirectoryScraperService.js";

async function testExtraction() {
  const clutchUrl = "https://clutch.co/in/developers/ahmedabad";
  const goodfirmsUrl =
    "https://www.goodfirms.co/software-development-companies/india/pune";

//   console.log("--- Testing Clutch Extraction ---");
//   const clutchCompanies = await DirectoryScraperService.scrapeClutch(clutchUrl);
//   console.log(`Found ${clutchCompanies.length} companies from Clutch`);
//   clutchCompanies.forEach((c) => {
//     console.log(
//       `- ${c.companyName}: ${
//         c.websiteUrl
//       } (Manual Review: ${!!c.needsManualReview})`
//     );
//   });

//   console.log("\n--- Testing GoodFirms Extraction ---");
  const gfCompanies = await DirectoryScraperService.scrapeGoodFirms(
    goodfirmsUrl
  );
  console.log(`Found ${gfCompanies.length} companies from GoodFirms`);
  gfCompanies.forEach((c) => {
    console.log(
      `- ${c.companyName}: ${
        c.websiteUrl
      } (Manual Review: ${!!c.needsManualReview})`
    );
  });

  await DirectoryScraperService.close();
}

testExtraction().catch(console.error);
