import { db } from "./src/database/db.js";

console.log("Populating outreach data...\n");

// 1. Insert Countries
const countries = [
  "India",
  "United States",
  "United Kingdom",
  "Canada",
  "Germany",
  "Australia",
  "France",
];

console.log("Inserting countries...");
const insertCountry = db.prepare(
  "INSERT OR IGNORE INTO countries (name) VALUES (?)"
);
const countryIds = {};
for (const country of countries) {
  const info = insertCountry.run(country);
  countryIds[country] = info.lastInsertRowid;
}
console.log(`  Inserted ${Object.keys(countryIds).length} countries\n`);

// 2. Insert Cities
const citiesByCountry = {
  India: [
    "Bangalore",
    "Hyderabad",
    "Chennai",
    "Pune",
    "Mumbai",
    "Noida",
    "Kolkata",
    "Ahmedabad",
    "Chandigarh",
  ],
  "United States": [
    "San Francisco Bay Area",
    "New York City",
    "Seattle",
    "Austin",
    "Los Angeles",
    "Boston",
    "Chicago",
    "Washington DC",
  ],
  "United Kingdom": [
    "London",
    "Manchester",
    "Birmingham",
    "Edinburgh",
    "Leeds",
    "Bristol",
  ],
  Canada: ["Toronto", "Vancouver", "Montreal", "Ottawa", "Calgary"],
  Germany: ["Berlin", "Munich", "Hamburg", "Frankfurt", "Stuttgart"],
  Australia: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"],
  France: ["Paris", "Lyon", "Toulouse", "Nantes", "Bordeaux"],
};

console.log("Inserting cities...");
const insertCity = db.prepare(
  "INSERT OR IGNORE INTO cities (country_id, name) VALUES (?, ?)"
);
const cityIds = {};
for (const [country, cities] of Object.entries(citiesByCountry)) {
  const countryId = countryIds[country];
  for (const city of cities) {
    const info = insertCity.run(countryId, city);
    const key = `${city}_${country}`;
    cityIds[key] = info.lastInsertRowid;
  }
  console.log(`  ${country}: ${cities.length} cities`);
}
console.log(`  Total: ${Object.keys(cityIds).length} cities\n`);

// 3. Insert Outreach Keywords
const keywords = [
  "software development company",
  "IT services company",
  "custom software development",
  "software app development",
  "enterprise software development",
  "mobile app development",
  "web app development",
  "IT consulting company",
  "technology development company",
  "software development firms",
];

console.log("Inserting outreach keywords...");
const insertKeyword = db.prepare(
  "INSERT OR IGNORE INTO outreach_keywords (phrase) VALUES (?)"
);
const keywordIds = {};
for (const keyword of keywords) {
  const info = insertKeyword.run(keyword);
  keywordIds[keyword] = info.lastInsertRowid;
}
console.log(`  Inserted ${Object.keys(keywordIds).length} keywords\n`);

// 4. Generate and Insert Search Queries
console.log("Generating search queries...");
const insertQuery = db.prepare(
  "INSERT OR IGNORE INTO search_queries (keyword_id, city_id, query) VALUES (?, ?, ?)"
);

let totalQueries = 0;
const queries = [];

for (const [keyword, keywordId] of Object.entries(keywordIds)) {
  for (const [cityKey, cityId] of Object.entries(cityIds)) {
    const cityName = cityKey.split("_")[0];
    const query = `${keyword} ${cityName}`;
    queries.push({ keywordId, cityId, query });
  }
}

// Insert all queries
const insertMany = db.transaction((qs) => {
  for (const q of qs) {
    insertQuery.run(q.keywordId, q.cityId, q.query);
    totalQueries++;
  }
});

insertMany(queries);
console.log(`  Generated and inserted ${totalQueries} search queries\n`);

// Summary
console.log("=== Data Population Summary ===");
console.log(`Countries:   ${Object.keys(countryIds).length}`);
console.log(`Cities:      ${Object.keys(cityIds).length}`);
console.log(`Keywords:    ${Object.keys(keywordIds).length}`);
console.log(`Queries:     ${totalQueries}`);
console.log("\nDone!");
