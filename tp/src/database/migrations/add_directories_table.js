import { db } from "../db.js";

console.log("Running migration: Add directories table...");

const transaction = db.transaction(() => {
  // Create the directories table
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS directories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      platform TEXT CHECK(platform IN ('clutch','goodfirms','other')) NOT NULL,
      country TEXT,
      city TEXT,
      category TEXT,
      is_active INTEGER DEFAULT 1,
      last_scraped_at DATETIME,
      scrape_count INTEGER DEFAULT 0,
      companies_found INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `
  ).run();

  // Create indexes
  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_directories_platform ON directories(platform)"
  ).run();
  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_directories_active ON directories(is_active)"
  ).run();

  console.log("✓ Created directories table");

  // Insert default directories
  const directories = [
    // Clutch - India
    { name: "Clutch - Ahmedabad", url: "https://clutch.co/in/developers/ahmedabad", platform: "clutch", country: "India", city: "Ahmedabad", category: "software" },
    { name: "Clutch - Bangalore", url: "https://clutch.co/in/developers/bangalore", platform: "clutch", country: "India", city: "Bangalore", category: "software" },
    { name: "Clutch - Hyderabad", url: "https://clutch.co/in/developers/hyderabad", platform: "clutch", country: "India", city: "Hyderabad", category: "software" },
    { name: "Clutch - Chennai", url: "https://clutch.co/in/developers/chennai", platform: "clutch", country: "India", city: "Chennai", category: "software" },
    { name: "Clutch - Pune", url: "https://clutch.co/in/developers/pune", platform: "clutch", country: "India", city: "Pune", category: "software" },
    { name: "Clutch - Mumbai", url: "https://clutch.co/in/developers/mumbai", platform: "clutch", country: "India", city: "Mumbai", category: "software" },
    { name: "Clutch - Noida", url: "https://clutch.co/in/developers/noida", platform: "clutch", country: "India", city: "Noida", category: "software" },
    { name: "Clutch - Delhi", url: "https://clutch.co/in/developers/delhi", platform: "clutch", country: "India", city: "Delhi", category: "software" },
    { name: "Clutch - Kolkata", url: "https://clutch.co/in/developers/kolkata", platform: "clutch", country: "India", city: "Kolkata", category: "software" },
    { name: "Clutch - Chandigarh", url: "https://clutch.co/in/developers/chandigarh", platform: "clutch", country: "India", city: "Chandigarh", category: "software" },
    // Clutch - US
    { name: "Clutch - San Francisco", url: "https://clutch.co/us/software-developers/san-francisco", platform: "clutch", country: "United States", city: "San Francisco", category: "software" },
    { name: "Clutch - New York", url: "https://clutch.co/us/software-developers/new-york", platform: "clutch", country: "United States", city: "New York", category: "software" },
    { name: "Clutch - Seattle", url: "https://clutch.co/us/software-developers/seattle", platform: "clutch", country: "United States", city: "Seattle", category: "software" },
    { name: "Clutch - Austin", url: "https://clutch.co/us/software-developers/austin", platform: "clutch", country: "United States", city: "Austin", category: "software" },
    { name: "Clutch - Los Angeles", url: "https://clutch.co/us/software-developers/los-angeles", platform: "clutch", country: "United States", city: "Los Angeles", category: "software" },
    { name: "Clutch - Boston", url: "https://clutch.co/us/software-developers/boston", platform: "clutch", country: "United States", city: "Boston", category: "software" },
    { name: "Clutch - Chicago", url: "https://clutch.co/us/software-developers/chicago", platform: "clutch", country: "United States", city: "Chicago", category: "software" },
    { name: "Clutch - Washington DC", url: "https://clutch.co/us/software-developers/washington-dc", platform: "clutch", country: "United States", city: "Washington DC", category: "software" },
    // Clutch - UK
    { name: "Clutch - London", url: "https://clutch.co.uk/software-developers/london", platform: "clutch", country: "United Kingdom", city: "London", category: "software" },
    { name: "Clutch - Manchester", url: "https://clutch.co.uk/software-developers/manchester", platform: "clutch", country: "United Kingdom", city: "Manchester", category: "software" },
    { name: "Clutch - Birmingham", url: "https://clutch.co.uk/software-developers/birmingham", platform: "clutch", country: "United Kingdom", city: "Birmingham", category: "software" },
    { name: "Clutch - Edinburgh", url: "https://clutch.co.uk/software-developers/edinburgh", platform: "clutch", country: "United Kingdom", city: "Edinburgh", category: "software" },
    { name: "Clutch - Leeds", url: "https://clutch.co.uk/software-developers/leeds", platform: "clutch", country: "United Kingdom", city: "Leeds", category: "software" },
    { name: "Clutch - Bristol", url: "https://clutch.co.uk/software-developers/bristol", platform: "clutch", country: "United Kingdom", city: "Bristol", category: "software" },
    // Clutch - Canada
    { name: "Clutch - Toronto", url: "https://clutch.co/ca/software-developers/toronto", platform: "clutch", country: "Canada", city: "Toronto", category: "software" },
    { name: "Clutch - Vancouver", url: "https://clutch.co/ca/software-developers/vancouver", platform: "clutch", country: "Canada", city: "Vancouver", category: "software" },
    { name: "Clutch - Montreal", url: "https://clutch.co/ca/software-developers/montreal", platform: "clutch", country: "Canada", city: "Montreal", category: "software" },
    { name: "Clutch - Ottawa", url: "https://clutch.co/ca/software-developers/ottawa", platform: "clutch", country: "Canada", city: "Ottawa", category: "software" },
    { name: "Clutch - Calgary", url: "https://clutch.co/ca/software-developers/calgary", platform: "clutch", country: "Canada", city: "Calgary", category: "software" },
    // Clutch - Australia
    { name: "Clutch - Sydney", url: "https://clutch.co.au/software-developers/sydney", platform: "clutch", country: "Australia", city: "Sydney", category: "software" },
    { name: "Clutch - Melbourne", url: "https://clutch.co.au/software-developers/melbourne", platform: "clutch", country: "Australia", city: "Melbourne", category: "software" },
    { name: "Clutch - Brisbane", url: "https://clutch.co.au/software-developers/brisbane", platform: "clutch", country: "Australia", city: "Brisbane", category: "software" },
    { name: "Clutch - Perth", url: "https://clutch.co.au/software-developers/perth", platform: "clutch", country: "Australia", city: "Perth", category: "software" },
    { name: "Clutch - Adelaide", url: "https://clutch.co.au/software-developers/adelaide", platform: "clutch", country: "Australia", city: "Adelaide", category: "software" },
    // GoodFirms - India
    { name: "GoodFirms - Ahmedabad", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/ahmedabad", platform: "goodfirms", country: "India", city: "Ahmedabad", category: "software" },
    { name: "GoodFirms - Bangalore", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/bangalore", platform: "goodfirms", country: "India", city: "Bangalore", category: "software" },
    { name: "GoodFirms - Hyderabad", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/hyderabad", platform: "goodfirms", country: "India", city: "Hyderabad", category: "software" },
    { name: "GoodFirms - Chennai", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/chennai", platform: "goodfirms", country: "India", city: "Chennai", category: "software" },
    { name: "GoodFirms - Pune", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/pune", platform: "goodfirms", country: "India", city: "Pune", category: "software" },
    { name: "GoodFirms - Mumbai", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/mumbai", platform: "goodfirms", country: "India", city: "Mumbai", category: "software" },
    { name: "GoodFirms - Delhi", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/delhi", platform: "goodfirms", country: "India", city: "Delhi", category: "software" },
    { name: "GoodFirms - Kolkata", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/kolkata", platform: "goodfirms", country: "India", city: "Kolkata", category: "software" },
    // GoodFirms - US
    { name: "GoodFirms - San Francisco", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/san-francisco", platform: "goodfirms", country: "United States", city: "San Francisco", category: "software" },
    { name: "GoodFirms - New York", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/new-york", platform: "goodfirms", country: "United States", city: "New York", category: "software" },
    { name: "GoodFirms - Austin", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/austin", platform: "goodfirms", country: "United States", city: "Austin", category: "software" },
    { name: "GoodFirms - Seattle", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/seattle", platform: "goodfirms", country: "United States", city: "Seattle", category: "software" },
    { name: "GoodFirms - Los Angeles", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/los-angeles", platform: "goodfirms", country: "United States", city: "Los Angeles", category: "software" },
    { name: "GoodFirms - Boston", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/boston", platform: "goodfirms", country: "United States", city: "Boston", category: "software" },
    // GoodFirms - UK
    { name: "GoodFirms - London", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/london", platform: "goodfirms", country: "United Kingdom", city: "London", category: "software" },
    { name: "GoodFirms - Manchester", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/manchester", platform: "goodfirms", country: "United Kingdom", city: "Manchester", category: "software" },
    { name: "GoodFirms - Birmingham", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/birmingham", platform: "goodfirms", country: "United Kingdom", city: "Birmingham", category: "software" },
    // GoodFirms - Canada
    { name: "GoodFirms - Toronto", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/toronto", platform: "goodfirms", country: "Canada", city: "Toronto", category: "software" },
    { name: "GoodFirms - Vancouver", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/vancouver", platform: "goodfirms", country: "Canada", city: "Vancouver", category: "software" },
    // GoodFirms - Australia
    { name: "GoodFirms - Sydney", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/sydney", platform: "goodfirms", country: "Australia", city: "Sydney", category: "software" },
    { name: "GoodFirms - Melbourne", url: "https://www.goodfirms.co/directory/city/top-software-development-companies/melbourne", platform: "goodfirms", country: "Australia", city: "Melbourne", category: "software" },
  ];

  const insertDirectory = db.prepare(
    "INSERT OR IGNORE INTO directories (name, url, platform, country, city, category) VALUES (?, ?, ?, ?, ?, ?)"
  );
  let dirCount = 0;
  for (const dir of directories) {
    const result = insertDirectory.run(dir.name, dir.url, dir.platform, dir.country, dir.city, dir.category);
    if (result.changes > 0) dirCount++;
  }

  console.log(`✓ Added ${dirCount} default directories`);
  console.log("Migration completed successfully.");
});

try {
  transaction();
} catch (error) {
  console.error("Migration failed:", error);
  process.exit(1);
}
