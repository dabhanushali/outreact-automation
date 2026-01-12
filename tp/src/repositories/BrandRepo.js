import { db } from "../database/db.js";

export class BrandRepo {
  static create(name, website = null) {
    const stmt = db.prepare("INSERT INTO brands (name, website) VALUES (?, ?)");
    const info = stmt.run(name, website);
    return info.lastInsertRowid;
  }

  static findByName(name) {
    const stmt = db.prepare("SELECT * FROM brands WHERE name = ?");
    return stmt.get(name);
  }

  static findOrCreate(name, website = null) {
    const existing = this.findByName(name);
    if (existing) return existing.id;
    return this.create(name, website);
  }
}
