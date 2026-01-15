import { db } from '../database/db.js';

class SmtpConfigRepo {
  /**
   * Get active SMTP configuration
   */
  static getActive() {
    return db.prepare(`
      SELECT * FROM smtp_config
      WHERE is_active = 1
      ORDER BY created_at DESC
      LIMIT 1
    `).get();
  }

  /**
   * Get all SMTP configurations
   */
  static getAll() {
    return db.prepare(`
      SELECT * FROM smtp_config
      ORDER BY created_at DESC
    `).all();
  }

  /**
   * Get SMTP config by ID
   */
  static getById(id) {
    return db.prepare('SELECT * FROM smtp_config WHERE id = ?').get(id);
  }

  /**
   * Save new SMTP configuration
   */
  static create(data) {
    // First, deactivate all existing configs
    db.prepare('UPDATE smtp_config SET is_active = 0').run();

    const stmt = db.prepare(`
      INSERT INTO smtp_config (host, port, secure, user, password, from_name, from_email, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);
    return stmt.run(
      data.host,
      data.port,
      data.secure ? 1 : 0,
      data.user || null,
      data.password || null,
      data.from_name || null,
      data.from_email
    );
  }

  /**
   * Update SMTP configuration
   */
  static update(id, data) {
    const fields = [];
    const values = [];

    if (data.host !== undefined) {
      fields.push('host = ?');
      values.push(data.host);
    }
    if (data.port !== undefined) {
      fields.push('port = ?');
      values.push(data.port);
    }
    if (data.secure !== undefined) {
      fields.push('secure = ?');
      values.push(data.secure ? 1 : 0);
    }
    if (data.user !== undefined) {
      fields.push('user = ?');
      values.push(data.user);
    }
    if (data.password !== undefined) {
      fields.push('password = ?');
      values.push(data.password);
    }
    if (data.from_name !== undefined) {
      fields.push('from_name = ?');
      values.push(data.from_name);
    }
    if (data.from_email !== undefined) {
      fields.push('from_email = ?');
      values.push(data.from_email);
    }
    if (data.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(data.is_active ? 1 : 0);
    }

    if (fields.length === 0) return;

    values.push(id);
    const query = `UPDATE smtp_config SET ${fields.join(', ')} WHERE id = ?`;
    return db.prepare(query).run(...values);
  }

  /**
   * Set as active configuration
   */
  static setActive(id) {
    db.prepare('UPDATE smtp_config SET is_active = 0').run();
    return db.prepare('UPDATE smtp_config SET is_active = 1 WHERE id = ?').run(id);
  }

  /**
   * Delete SMTP configuration
   */
  static delete(id) {
    return db.prepare('DELETE FROM smtp_config WHERE id = ?').run(id);
  }
}

export default SmtpConfigRepo;
