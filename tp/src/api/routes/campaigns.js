import express from 'express';
import { db } from '../../database/db.js';

const router = express.Router();

// List all campaigns
router.get('/campaigns', (req, res) => {
  try {
    const campaigns = db.prepare(`
      SELECT
        c.*,
        b.name as brand_name,
        COUNT(DISTINCT l.id) as lead_count,
        COUNT(DISTINCT p.id) as prospect_count
      FROM campaigns c
      LEFT JOIN brands b ON c.brand_id = b.id
      LEFT JOIN leads l ON c.id = l.campaign_id
      LEFT JOIN prospects p ON l.prospect_id = p.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `).all();

    // Parse keywords JSON
    campaigns.forEach(c => {
      try {
        c.keywords = JSON.parse(c.keywords || '[]');
      } catch {
        c.keywords = [];
      }
    });

    res.render('campaigns/list', { campaigns, user: req.session });
  } catch (error) {
    console.error('Error loading campaigns:', error);
    res.status(500).render('error', { error: 'Failed to load campaigns', user: req.session });
  }
});

// Create campaign form
router.get('/campaigns/new', (req, res) => {
  try {
    const brands = db.prepare('SELECT * FROM brands ORDER BY name').all();
    const cities = db.prepare(`
      SELECT ci.*, co.name as country_name
      FROM cities ci
      JOIN countries co ON ci.country_id = co.id
      ORDER BY co.name, ci.name
    `).all();

    res.render('campaigns/form', {
      brands,
      cities,
      campaign: null,
      mode: 'create',
      user: req.session
    });
  } catch (error) {
    console.error('Error loading form:', error);
    res.status(500).render('error', { error: 'Failed to load form', user: req.session });
  }
});

// Edit campaign form
router.get('/campaigns/:id/edit', (req, res) => {
  try {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) {
      return res.status(404).render('error', { error: 'Campaign not found', user: req.session });
    }

    try {
      const parsedKeywords = JSON.parse(campaign.keywords || '[]');
      // Convert array to newline-separated string for the textarea
      campaign.keywords = Array.isArray(parsedKeywords) ? parsedKeywords.join('\n') : '';
    } catch {
      campaign.keywords = '';
    }

    const brands = db.prepare('SELECT * FROM brands ORDER BY name').all();
    const cities = db.prepare(`
      SELECT ci.*, co.name as country_name
      FROM cities ci
      JOIN countries co ON ci.country_id = co.id
      ORDER BY co.name, ci.name
    `).all();

    // Get campaign assets
    const assets = db.prepare(`
      SELECT * FROM campaign_assets
      WHERE campaign_id = ?
      ORDER BY created_at DESC
    `).all(campaign.id);

    res.render('campaigns/form', {
      brands,
      cities,
      campaign,
      assets,
      mode: 'edit',
      user: req.session
    });
  } catch (error) {
    console.error('Error loading campaign:', error);
    res.status(500).render('error', { error: 'Failed to load campaign', user: req.session });
  }
});

// View campaign details
router.get('/campaigns/:id', (req, res) => {
  try {
    const campaign = db.prepare(`
      SELECT c.*, b.name as brand_name
      FROM campaigns c
      LEFT JOIN brands b ON c.brand_id = b.id
      WHERE c.id = ?
    `).get(req.params.id);

    if (!campaign) {
      return res.status(404).render('error', { error: 'Campaign not found', user: req.session });
    }

    try {
      campaign.keywords = JSON.parse(campaign.keywords || '[]');
    } catch {
      campaign.keywords = [];
    }

    // Get leads for this campaign
    const leads = db.prepare(`
      SELECT
        l.*,
        p.domain,
        p.company_name,
        p.city,
        e.email
      FROM leads l
      LEFT JOIN prospects p ON l.prospect_id = p.id
      LEFT JOIN emails e ON p.id = e.prospect_id
      WHERE l.campaign_id = ?
      ORDER BY l.found_at DESC
      LIMIT 50
    `).all(campaign.id);

    // Get campaign assets
    const assets = db.prepare(`
      SELECT * FROM campaign_assets
      WHERE campaign_id = ?
      ORDER BY created_at DESC
    `).all(campaign.id);

    // Get stats
    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT l.prospect_id) as total_prospects,
        COUNT(DISTINCT e.id) as total_emails,
        COUNT(DISTINCT CASE WHEN l.status = 'OUTREACH_SENT' THEN l.id END) as outreach_sent,
        COUNT(DISTINCT CASE WHEN l.status = 'REPLIED' THEN l.id END) as replied
      FROM leads l
      LEFT JOIN prospects p ON l.prospect_id = p.id
      LEFT JOIN emails e ON p.id = e.prospect_id
      WHERE l.campaign_id = ?
    `).get(campaign.id);

    res.render('campaigns/detail', {
      campaign,
      leads,
      assets,
      stats,
      user: req.session
    });
  } catch (error) {
    console.error('Error loading campaign details:', error);
    res.status(500).render('error', { error: 'Failed to load campaign details', user: req.session });
  }
});

// Create campaign
router.post('/campaigns', (req, res) => {
  try {
    const { brand_id, name, target_url, keywords } = req.body;

    const stmt = db.prepare(`
      INSERT INTO campaigns (brand_id, name, target_url, keywords)
      VALUES (?, ?, ?, ?)
    `);

    // Split keywords by newline, trim whitespace, and wrap in quotes
    const keywordsArray = keywords
      ? keywords.split('\n').map(k => k.trim()).filter(k => k.length > 0).map(k => `"${k}"`)
      : [];
    const info = stmt.run(brand_id, name, target_url || null, JSON.stringify(keywordsArray));

    res.redirect(`/campaigns/${info.lastInsertRowid}`);
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).render('error', { error: 'Failed to create campaign: ' + error.message, user: req.session });
  }
});

// Update campaign
router.post('/campaigns/:id', (req, res) => {
  try {
    const { brand_id, name, target_url, keywords } = req.body;
    const id = req.params.id;

    // Split keywords by newline, trim whitespace, and wrap in quotes
    const keywordsArray = keywords
      ? keywords.split('\n').map(k => k.trim()).filter(k => k.length > 0).map(k => `"${k}"`)
      : [];

    const stmt = db.prepare(`
      UPDATE campaigns
      SET brand_id = ?, name = ?, target_url = ?, keywords = ?
      WHERE id = ?
    `);

    stmt.run(brand_id, name, target_url || null, JSON.stringify(keywordsArray), id);

    res.redirect(`/campaigns/${id}`);
  } catch (error) {
    console.error('Error updating campaign:', error);
    res.status(500).render('error', { error: 'Failed to update campaign: ' + error.message, user: req.session });
  }
});

// Delete campaign
router.post('/campaigns/:id/delete', (req, res) => {
  try {
    const id = req.params.id;

    // Delete related records
    db.prepare('DELETE FROM leads WHERE campaign_id = ?').run(id);
    db.prepare('DELETE FROM campaign_assets WHERE campaign_id = ?').run(id);
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);

    res.redirect('/campaigns');
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).render('error', { error: 'Failed to delete campaign: ' + error.message, user: req.session });
  }
});

// Add asset to campaign
router.post('/campaigns/:id/assets', (req, res) => {
  try {
    const { type, title, url } = req.body;
    const campaign_id = req.params.id;

    const stmt = db.prepare(`
      INSERT INTO campaign_assets (campaign_id, type, title, url)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(campaign_id, type, title, url);

    res.redirect(`/campaigns/${campaign_id}`);
  } catch (error) {
    console.error('Error adding asset:', error);
    res.status(500).render('error', { error: 'Failed to add asset: ' + error.message, user: req.session });
  }
});

// Delete asset
router.post('/campaigns/:campaignId/assets/:assetId/delete', (req, res) => {
  try {
    const { campaignId, assetId } = req.params;

    db.prepare('DELETE FROM campaign_assets WHERE id = ?').run(assetId);

    res.redirect(`/campaigns/${campaignId}`);
  } catch (error) {
    console.error('Error deleting asset:', error);
    res.status(500).render('error', { error: 'Failed to delete asset: ' + error.message, user: req.session });
  }
});

export default router;
