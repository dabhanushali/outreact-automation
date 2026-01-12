import { db } from "./src/database/db.js";

console.log("--- DB Verification ---");
const brands = db.prepare("SELECT * FROM brands").all();
console.log("Brands:", brands);

const campaigns = db.prepare("SELECT * FROM campaigns").all();
console.log("Campaigns Count:", campaigns.length);
console.log("First 3 Campaigns:", campaigns.slice(0, 3));
