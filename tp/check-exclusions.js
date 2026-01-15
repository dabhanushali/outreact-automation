import { db } from './src/database/db.js';

const domainCount = db.prepare("SELECT COUNT(*) as count FROM exclusions WHERE type = 'domain'").get();
const emailCount = db.prepare("SELECT COUNT(*) as count FROM exclusions WHERE type = 'email'").get();

console.log('Domain exclusions:', domainCount.count);
console.log('Email exclusions:', emailCount.count);
console.log('\nSample exclusions:');

const samples = db.prepare('SELECT type, value, reason FROM exclusions LIMIT 10').all();
samples.forEach(s => {
  console.log(`  ${s.type}: ${s.value}`);
});
