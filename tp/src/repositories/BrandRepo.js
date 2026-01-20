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

  static getAll() {
    const stmt = db.prepare("SELECT * FROM brands ORDER BY name");
    return stmt.all();
  }

  static getById(id) {
    const stmt = db.prepare("SELECT * FROM brands WHERE id = ?");
    return stmt.get(id);
  }

  static update(id, data) {
    const updates = [];
    const params = [];

    if (data.name !== undefined) {
      updates.push("name = ?");
      params.push(data.name);
    }
    if (data.website !== undefined) {
      updates.push("website = ?");
      params.push(data.website);
    }
    if (data.smtp_host !== undefined) {
      updates.push("smtp_host = ?");
      params.push(data.smtp_host);
    }
    if (data.smtp_port !== undefined) {
      updates.push("smtp_port = ?");
      params.push(data.smtp_port);
    }
    if (data.smtp_secure !== undefined) {
      updates.push("smtp_secure = ?");
      params.push(data.smtp_secure ? 1 : 0);
    }
    if (data.smtp_user !== undefined) {
      updates.push("smtp_user = ?");
      params.push(data.smtp_user);
    }
    if (data.smtp_password !== undefined) {
      updates.push("smtp_password = ?");
      params.push(data.smtp_password);
    }
    if (data.smtp_from_name !== undefined) {
      updates.push("smtp_from_name = ?");
      params.push(data.smtp_from_name);
    }
    if (data.smtp_from_email !== undefined) {
      updates.push("smtp_from_email = ?");
      params.push(data.smtp_from_email);
    }
    if (data.smtp_is_active !== undefined) {
      updates.push("smtp_is_active = ?");
      params.push(data.smtp_is_active ? 1 : 0);
    }

    if (updates.length === 0) return this.getById(id);

    params.push(id);
    const stmt = db.prepare(`UPDATE brands SET ${updates.join(", ")} WHERE id = ?`);
    stmt.run(...params);

    return this.getById(id);
  }

  static delete(id) {
    // Count campaigns before deletion
    const campaignCount = db
      .prepare("SELECT COUNT(*) as count FROM campaigns WHERE brand_id = ?")
      .get(id);

    // Delete all associated campaigns (cascade)
    db.prepare("DELETE FROM campaigns WHERE brand_id = ?").run(id);

    // Delete the brand
    const stmt = db.prepare("DELETE FROM brands WHERE id = ?");
    const info = stmt.run(id);

    if (info.changes > 0) {
      return {
        success: true,
        deletedCampaigns: campaignCount.count
      };
    }

    return { success: false, error: "Brand not found" };
  }

  static getActiveSMTP() {
    const stmt = db.prepare("SELECT * FROM brands WHERE smtp_is_active = 1 AND smtp_host IS NOT NULL LIMIT 1");
    return stmt.get();
  }

  static testConnection(id) {
    const brand = this.getById(id);
    if (!brand || !brand.smtp_host) {
      return { success: false, error: "No SMTP configuration found for this brand" };
    }

    // For now, just validate the configuration
    if (!brand.smtp_host || !brand.smtp_from_email) {
      return { success: false, error: "SMTP host and from email are required" };
    }

    return { success: true, message: "SMTP configuration is valid" };
  }

  static getCampaignCount(id) {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM campaigns WHERE brand_id = ?");
    return stmt.get(id);
  }
}
