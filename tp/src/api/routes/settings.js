import express from 'express';
import { db } from '../../database/db.js';
import { DailyLimitService } from '../../services/DailyLimitService.js';

const router = express.Router();

// Brands management
router.get('/settings/brands', (req, res) => {
  try {
    const brands = db.prepare('SELECT * FROM brands ORDER BY name').all();

    // Get campaign count for each brand
    brands.forEach(brand => {
      const count = db.prepare('SELECT COUNT(*) as count FROM campaigns WHERE brand_id = ?').get(brand.id);
      brand.campaign_count = count.count;
    });

    res.render('settings/brands', { brands, user: req.session });
  } catch (error) {
    console.error('Error loading brands:', error);
    res.status(500).render('error', { error: 'Failed to load brands', user: req.session });
  }
});

// Create brand
router.post('/settings/brands', (req, res) => {
  try {
    const { name, website } = req.body;

    db.prepare('INSERT INTO brands (name, website) VALUES (?, ?)')
      .run(name, website || null);

    res.redirect('/settings/brands');
  } catch (error) {
    console.error('Error creating brand:', error);
    res.status(500).render('error', { error: 'Failed to create brand: ' + error.message, user: req.session });
  }
});

// Delete brand
router.post('/settings/brands/:id/delete', (req, res) => {
  try {
    const id = req.params.id;

    // Check if brand has campaigns
    const campaignCount = db.prepare('SELECT COUNT(*) as count FROM campaigns WHERE brand_id = ?').get(id);

    if (campaignCount.count > 0) {
      return res.status(400).render('error', {
        error: 'Cannot delete brand with associated campaigns. Delete campaigns first.',
        user: req.session
      });
    }

    db.prepare('DELETE FROM brands WHERE id = ?').run(id);

    res.redirect('/settings/brands');
  } catch (error) {
    console.error('Error deleting brand:', error);
    res.status(500).render('error', { error: 'Failed to delete brand: ' + error.message, user: req.session });
  }
});

// Daily limits
router.get('/settings/daily-limits', (req, res) => {
  try {
    const limits = db.prepare(`
      SELECT * FROM daily_limits
      ORDER BY date DESC
      LIMIT 30
    `).all();

    const limitSettings = DailyLimitService.getAllLimits();

    res.render('settings/daily-limits', { limits, limitSettings, user: req.session });
  } catch (error) {
    console.error('Error loading daily limits:', error);
    res.status(500).render('error', { error: 'Failed to load daily limits', user: req.session });
  }
});

// Update today's limits
router.post('/settings/daily-limits/update', (req, res) => {
  try {
    const { date, prospects_added, emails_found, blog_assets_found, outreach_sent } = req.body;

    db.prepare(`
      INSERT OR REPLACE INTO daily_limits
      (date, prospects_added, emails_found, blog_assets_found, outreach_sent)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      date,
      prospects_added || 0,
      emails_found || 0,
      blog_assets_found || 0,
      outreach_sent || 0
    );

    res.redirect('/settings/daily-limits');
  } catch (error) {
    console.error('Error updating daily limits:', error);
    res.status(500).render('error', { error: 'Failed to update daily limits: ' + error.message, user: req.session });
  }
});

// Update daily limit settings (thresholds)
router.post('/settings/daily-limits/settings', (req, res) => {
  try {
    const { prospect_limit, blog_limit, email_limit, outreach_limit } = req.body;

    DailyLimitService.updateLimits({
      prospect_limit: prospect_limit ? parseInt(prospect_limit) : undefined,
      blog_limit: blog_limit ? parseInt(blog_limit) : undefined,
      email_limit: email_limit ? parseInt(email_limit) : undefined,
      outreach_limit: outreach_limit ? parseInt(outreach_limit) : undefined
    });

    res.redirect('/settings/daily-limits');
  } catch (error) {
    console.error('Error updating limit settings:', error);
    res.status(500).render('error', { error: 'Failed to update limit settings: ' + error.message, user: req.session });
  }
});

// API: Get daily limit settings
router.get('/api/settings/daily-limits', (req, res) => {
  try {
    const limits = DailyLimitService.getAllLimits();
    const today = DailyLimitService.getTodayStats();

    res.json({
      success: true,
      settings: limits,
      today: today
    });
  } catch (error) {
    console.error('Error getting daily limit settings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Keywords management
router.get('/settings/keywords', (req, res) => {
  try {
    const keywords = db.prepare('SELECT * FROM outreach_keywords ORDER BY phrase').all();

    res.render('settings/keywords', { keywords, user: req.session });
  } catch (error) {
    console.error('Error loading keywords:', error);
    res.status(500).render('error', { error: 'Failed to load keywords', user: req.session });
  }
});

// Add keyword
router.post('/settings/keywords', (req, res) => {
  try {
    const { phrase } = req.body;

    db.prepare('INSERT INTO outreach_keywords (phrase) VALUES (?)').run(phrase);

    res.redirect('/settings/keywords');
  } catch (error) {
    console.error('Error adding keyword:', error);
    res.status(500).render('error', { error: 'Failed to add keyword: ' + error.message, user: req.session });
  }
});

// Delete keyword
router.post('/settings/keywords/:id/delete', (req, res) => {
  try {
    const id = req.params.id;

    db.prepare('DELETE FROM outreach_keywords WHERE id = ?').run(id);

    res.redirect('/settings/keywords');
  } catch (error) {
    console.error('Error deleting keyword:', error);
    res.status(500).render('error', { error: 'Failed to delete keyword: ' + error.message, user: req.session });
  }
});

// Search modifiers
router.get('/settings/modifiers', (req, res) => {
  try {
    const modifiers = db.prepare('SELECT * FROM search_modifiers ORDER BY category, modifier').all();

    res.render('settings/modifiers', { modifiers, user: req.session });
  } catch (error) {
    console.error('Error loading modifiers:', error);
    res.status(500).render('error', { error: 'Failed to load modifiers', user: req.session });
  }
});

// Add modifier
router.post('/settings/modifiers', (req, res) => {
  try {
    const { category, modifier } = req.body;

    db.prepare('INSERT INTO search_modifiers (category, modifier) VALUES (?, ?)')
      .run(category, modifier);

    res.redirect('/settings/modifiers');
  } catch (error) {
    console.error('Error adding modifier:', error);
    res.status(500).render('error', { error: 'Failed to add modifier: ' + error.message, user: req.session });
  }
});

// Delete modifier
router.post('/settings/modifiers/:id/delete', (req, res) => {
  try {
    const id = req.params.id;

    db.prepare('DELETE FROM search_modifiers WHERE id = ?').run(id);

    res.redirect('/settings/modifiers');
  } catch (error) {
    console.error('Error deleting modifier:', error);
    res.status(500).render('error', { error: 'Failed to delete modifier: ' + error.message, user: req.session });
  }
});

// Exclusions management
router.get('/settings/exclusions', (req, res) => {
  try {
    const { type, search } = req.query;

    let query = 'SELECT * FROM exclusions WHERE 1=1';
    const params = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (search) {
      query += ' AND value LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY added_at DESC LIMIT 500';

    const exclusions = db.prepare(query).all(...params);

    res.render('settings/exclusions', {
      exclusions,
      filters: { type, search },
      user: req.session
    });
  } catch (error) {
    console.error('Error loading exclusions:', error);
    res.status(500).render('error', { error: 'Failed to load exclusions', user: req.session });
  }
});

// Add exclusion
router.post('/settings/exclusions', (req, res) => {
  try {
    const { type, value, reason } = req.body;

    db.prepare('INSERT INTO exclusions (type, value, reason) VALUES (?, ?, ?)')
      .run(type, value, reason || null);

    res.redirect('/settings/exclusions');
  } catch (error) {
    console.error('Error adding exclusion:', error);
    res.status(500).render('error', { error: 'Failed to add exclusion: ' + error.message, user: req.session });
  }
});

// Delete exclusion
router.post('/settings/exclusions/:id/delete', (req, res) => {
  try {
    const id = req.params.id;

    db.prepare('DELETE FROM exclusions WHERE id = ?').run(id);

    res.redirect('/settings/exclusions');
  } catch (error) {
    console.error('Error deleting exclusion:', error);
    res.status(500).render('error', { error: 'Failed to delete exclusion: ' + error.message, user: req.session });
  }
});

// Geographic targeting
router.get('/settings/geo', (req, res) => {
  try {
    const countries = db.prepare(`
      SELECT
        c.*,
        COUNT(DISTINCT ci.id) as city_count
      FROM countries c
      LEFT JOIN cities ci ON c.id = ci.country_id
      GROUP BY c.id
      ORDER BY c.name
    `).all();

    const cities = db.prepare(`
      SELECT
        ci.*,
        co.name as country_name
      FROM cities ci
      JOIN countries co ON ci.country_id = co.id
      ORDER BY co.name, ci.name
      LIMIT 500
    `).all();

    res.render('settings/geo', { countries, cities, user: req.session });
  } catch (error) {
    console.error('Error loading geo settings:', error);
    res.status(500).render('error', { error: 'Failed to load geo settings', user: req.session });
  }
});

// Add country
router.post('/settings/countries', (req, res) => {
  try {
    const { name } = req.body;

    db.prepare('INSERT INTO countries (name) VALUES (?)').run(name);

    res.redirect('/settings/geo');
  } catch (error) {
    console.error('Error adding country:', error);
    res.status(500).render('error', { error: 'Failed to add country: ' + error.message, user: req.session });
  }
});

// Add city
router.post('/settings/cities', (req, res) => {
  try {
    const { country_id, name } = req.body;

    db.prepare('INSERT INTO cities (country_id, name) VALUES (?, ?)').run(country_id, name);

    res.redirect('/settings/geo');
  } catch (error) {
    console.error('Error adding city:', error);
    res.status(500).render('error', { error: 'Failed to add city: ' + error.message, user: req.session });
  }
});

export default router;
