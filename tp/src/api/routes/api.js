import express from 'express';
import { db } from '../../database/db.js';

const router = express.Router();

// Get dashboard stats
router.get('/stats', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const stats = {
      campaigns: db.prepare('SELECT COUNT(*) as count FROM campaigns').get().count,
      prospects: db.prepare('SELECT COUNT(*) as count FROM prospects').get().count,
      blogProspects: db.prepare('SELECT COUNT(*) as count FROM blog_prospects').get().count,
      emails: db.prepare('SELECT COUNT(*) as count FROM emails').get().count,
      blogEmails: db.prepare('SELECT COUNT(*) as count FROM blog_emails').get().count,
      leads: db.prepare('SELECT COUNT(*) as count FROM leads').get().count,
      today: db.prepare('SELECT * FROM daily_limits WHERE date = ?').get(today) || {
        prospects_added: 0,
        emails_found: 0,
        blog_assets_found: 0,
        outreach_sent: 0
      }
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get chart data
router.get('/charts/leads-by-status', (req, res) => {
  try {
    const data = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM leads
      GROUP BY status
    `).all();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/charts/source-breakdown', (req, res) => {
  try {
    const data = db.prepare(`
      SELECT
        COALESCE(source_type, 'unknown') as source,
        COUNT(*) as count
      FROM leads
      GROUP BY source_type
      ORDER BY count DESC
    `).all();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/charts/campaign-performance', (req, res) => {
  try {
    const data = db.prepare(`
      SELECT
        c.name,
        COUNT(DISTINCT l.prospect_id) as prospect_count,
        COUNT(DISTINCT e.id) as email_count,
        COUNT(DISTINCT CASE WHEN l.status = 'OUTREACH_SENT' THEN l.id END) as outreach_count
      FROM campaigns c
      LEFT JOIN leads l ON c.id = l.campaign_id
      LEFT JOIN prospects p ON l.prospect_id = p.id
      LEFT JOIN emails e ON p.id = e.prospect_id
      GROUP BY c.id
      ORDER BY prospect_count DESC
    `).all();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/charts/daily-trends', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const data = db.prepare(`
      SELECT
        date,
        prospects_added,
        emails_found,
        blog_assets_found,
        outreach_sent
      FROM daily_limits
      ORDER BY date DESC
      LIMIT ?
    `).all(days);
    res.json(data.reverse());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
