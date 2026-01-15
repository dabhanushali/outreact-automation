import { db } from '../database/db.js';

class EmailTemplateRepo {
  /**
   * Get all templates
   */
  static getAll(activeOnly = false) {
    let query = 'SELECT * FROM email_templates';
    if (activeOnly) {
      query += ' WHERE is_active = 1';
    }
    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all();
  }

  /**
   * Get template by ID
   */
  static getById(id) {
    return db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id);
  }

  /**
   * Create new template
   */
  static create(data) {
    const stmt = db.prepare(`
      INSERT INTO email_templates (name, subject, body, variables, is_active)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.name,
      data.subject,
      data.body,
      data.variables ? JSON.stringify(data.variables) : null,
      data.is_active !== undefined ? data.is_active : 1
    );
  }

  /**
   * Update template
   */
  static update(id, data) {
    const fields = [];
    const values = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.subject !== undefined) {
      fields.push('subject = ?');
      values.push(data.subject);
    }
    if (data.body !== undefined) {
      fields.push('body = ?');
      values.push(data.body);
    }
    if (data.variables !== undefined) {
      fields.push('variables = ?');
      values.push(data.variables ? JSON.stringify(data.variables) : null);
    }
    if (data.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(data.is_active);
    }

    if (fields.length === 0) return;

    values.push(id);
    const query = `UPDATE email_templates SET ${fields.join(', ')} WHERE id = ?`;
    return db.prepare(query).run(...values);
  }

  /**
   * Delete template
   */
  static delete(id) {
    return db.prepare('DELETE FROM email_templates WHERE id = ?').run(id);
  }

  /**
   * Get active template count
   */
  static getActiveCount() {
    const result = db.prepare("SELECT COUNT(*) as count FROM email_templates WHERE is_active = 1").get();
    return result.count;
  }
}

export default EmailTemplateRepo;
