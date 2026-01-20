import { db } from "../database/db.js";

class DirectoryRepo {
  /**
   * Get all directories with optional filters
   */
  static getAll(filters = {}) {
    const { platform, country, is_active } = filters;
    let query = "SELECT * FROM directories WHERE 1=1";
    const params = [];

    if (platform) {
      query += " AND platform = ?";
      params.push(platform);
    }

    if (country) {
      query += " AND country = ?";
      params.push(country);
    }

    if (is_active !== undefined) {
      query += " AND is_active = ?";
      params.push(is_active ? 1 : 0);
    }

    query += " ORDER BY country, city, platform, name";

    return db.prepare(query).all(...params);
  }

  /**
   * Get directory by ID
   */
  static getById(id) {
    return db.prepare("SELECT * FROM directories WHERE id = ?").get(id);
  }

  /**
   * Get active directories (for scraping)
   */
  static getActive(filters = {}) {
    return this.getAll({ ...filters, is_active: true });
  }

  /**
   * Get directories by platform
   */
  static getByPlatform(platform) {
    return db.prepare(
      "SELECT * FROM directories WHERE platform = ? ORDER BY country, city"
    ).all(platform);
  }

  /**
   * Get directories by country
   */
  static getByCountry(country) {
    return db.prepare(
      "SELECT * FROM directories WHERE country = ? ORDER BY city, platform"
    ).all(country);
  }

  /**
   * Create new directory
   */
  static create(data) {
    const { name, url, platform, country, city, category } = data;

    const result = db.prepare(
      `INSERT INTO directories (name, url, platform, country, city, category)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(name, url, platform, country, city, category);

    return this.getById(result.lastInsertRowid);
  }

  /**
   * Update directory
   */
  static update(id, data) {
    const { name, url, platform, country, city, category, is_active } = data;

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(name);
    }
    if (url !== undefined) {
      updates.push("url = ?");
      params.push(url);
    }
    if (platform !== undefined) {
      updates.push("platform = ?");
      params.push(platform);
    }
    if (country !== undefined) {
      updates.push("country = ?");
      params.push(country);
    }
    if (city !== undefined) {
      updates.push("city = ?");
      params.push(city);
    }
    if (category !== undefined) {
      updates.push("category = ?");
      params.push(category);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      params.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return this.getById(id);
    }

    params.push(id);
    db.prepare(
      `UPDATE directories SET ${updates.join(", ")} WHERE id = ?`
    ).run(...params);

    return this.getById(id);
  }

  /**
   * Toggle active status
   */
  static toggleActive(id) {
    const dir = this.getById(id);
    if (!dir) return null;

    const newStatus = dir.is_active ? 0 : 1;
    db.prepare("UPDATE directories SET is_active = ? WHERE id = ?").run(
      newStatus,
      id
    );

    return this.getById(id);
  }

  /**
   * Update scrape stats
   */
  static updateScrapeStats(id, companiesFound) {
    db.prepare(
      `UPDATE directories
       SET scrape_count = scrape_count + 1,
           companies_found = companies_found + ?,
           last_scraped_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(companiesFound, id);

    return this.getById(id);
  }

  /**
   * Delete directory
   */
  static delete(id) {
    const result = db.prepare("DELETE FROM directories WHERE id = ?").run(id);
    return result.changes > 0;
  }

  /**
   * Get available platforms
   */
  static getPlatforms() {
    return db
      .prepare("SELECT DISTINCT platform FROM directories ORDER BY platform")
      .all()
      .map((row) => row.platform);
  }

  /**
   * Get available countries
   */
  static getCountries() {
    return db
      .prepare("SELECT DISTINCT country FROM directories WHERE country IS NOT NULL ORDER BY country")
      .all()
      .map((row) => row.country);
  }

  /**
   * Get stats
   */
  static getStats() {
    const total = db.prepare("SELECT COUNT(*) as count FROM directories").get().count;
    const active = db
      .prepare("SELECT COUNT(*) as count FROM directories WHERE is_active = 1")
      .get().count;
    const byPlatform = db
      .prepare(
        "SELECT platform, COUNT(*) as count FROM directories GROUP BY platform ORDER BY count DESC"
      )
      .all();
    const byCountry = db
      .prepare(
        "SELECT country, COUNT(*) as count FROM directories WHERE country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 10"
      )
      .all();

    return {
      total,
      active,
      inactive: total - active,
      byPlatform,
      byCountry,
    };
  }
}

export default DirectoryRepo;
