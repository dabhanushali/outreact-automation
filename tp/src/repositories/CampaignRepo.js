import { db } from "../database/db.js";

export class CampaignRepo {
  static create(brandId, name, targetUrl = null, keywords = []) {
    const stmt = db.prepare(
      "INSERT INTO campaigns (brand_id, name, target_url, keywords) VALUES (?, ?, ?, ?)"
    );
    const info = stmt.run(brandId, name, targetUrl, JSON.stringify(keywords));
    return info.lastInsertRowid;
  }

  static updateKeywords(id, keywords) {
    const stmt = db.prepare("UPDATE campaigns SET keywords = ? WHERE id = ?");
    stmt.run(JSON.stringify(keywords), id);
  }

  static findByUrl(brandId, targetUrl) {
    const stmt = db.prepare(
      "SELECT * FROM campaigns WHERE brand_id = ? AND target_url = ?"
    );
    return stmt.get(brandId, targetUrl);
  }

  static findByName(brandId, name) {
    const stmt = db.prepare(
      "SELECT * FROM campaigns WHERE brand_id = ? AND name = ?"
    );
    return stmt.get(brandId, name);
  }

  static findOrCreate(brandId, name, targetUrl = null, keywords = []) {
    // If targetUrl depends on the exact campaign logic
    if (targetUrl) {
      const existing = this.findByUrl(brandId, targetUrl);
      if (existing) {
        // If we have new keywords, update them?
        // For now, let's just return the ID.
        // The parser logic handles explicit updates.
        return existing.id;
      }
    } else {
      const existing = this.findByName(brandId, name);
      if (existing) return existing.id;
    }
    return this.create(brandId, name, targetUrl, keywords);
  }
}
