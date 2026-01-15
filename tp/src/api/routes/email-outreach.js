import express from 'express';
import { db } from '../../database/db.js';
import EmailTemplateRepo from '../../repositories/EmailTemplateRepo.js';
import SmtpConfigRepo from '../../repositories/SmtpConfigRepo.js';
import EmailQueueService from '../../services/EmailQueueService.js';
import TemplateService from '../../services/TemplateService.js';
import EmailService from '../../services/EmailService.js';

const router = express.Router();

// ============================================
// EMAIL TEMPLATES
// ============================================

// List all templates
router.get('/email-outreach/templates', (req, res) => {
  try {
    const templates = TemplateService.getAllTemplates();
    res.render('email-outreach/templates', {
      templates,
      availableVariables: TemplateService.getAvailableVariables(),
      user: req.session
    });
  } catch (error) {
    console.error('Error loading templates:', error);
    res.status(500).render('error', { error: 'Failed to load templates', user: req.session });
  }
});

// Create new template
router.post('/email-outreach/templates', (req, res) => {
  try {
    const { name, subject, body, is_active } = req.body;

    if (!name || !subject || !body) {
      return res.status(400).render('error', {
        error: 'Name, subject, and body are required',
        user: req.session
      });
    }

    TemplateService.createTemplate({
      name,
      subject,
      body,
      is_active: is_active === '1' || is_active === true
    });

    res.redirect('/email-outreach/templates');
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).render('error', { error: 'Failed to create template: ' + error.message, user: req.session });
  }
});

// View/edit template
router.get('/email-outreach/templates/:id', (req, res) => {
  try {
    const template = TemplateService.getTemplate(req.params.id);
    if (!template) {
      return res.status(404).render('error', { error: 'Template not found', user: req.session });
    }

    const campaigns = db.prepare('SELECT id, name FROM campaigns ORDER BY name').all();

    res.render('email-outreach/template-detail', {
      template,
      campaigns,
      availableVariables: TemplateService.getAvailableVariables(),
      user: req.session
    });
  } catch (error) {
    console.error('Error loading template:', error);
    res.status(500).render('error', { error: 'Failed to load template', user: req.session });
  }
});

// Update template
router.post('/email-outreach/templates/:id/update', (req, res) => {
  try {
    const { name, subject, body, is_active } = req.body;

    TemplateService.updateTemplate(req.params.id, {
      name,
      subject,
      body,
      is_active: is_active === '1' || is_active === true
    });

    res.redirect(`/email-outreach/templates/${req.params.id}`);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).render('error', { error: 'Failed to update template: ' + error.message, user: req.session });
  }
});

// Delete template
router.post('/email-outreach/templates/:id/delete', (req, res) => {
  try {
    TemplateService.deleteTemplate(req.params.id);
    res.redirect('/email-outreach/templates');
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).render('error', { error: 'Failed to delete template', user: req.session });
  }
});

// Preview template
router.get('/email-outreach/templates/:id/preview', (req, res) => {
  try {
    const preview = TemplateService.previewTemplate(req.params.id);
    res.json({ success: true, preview });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// EMAIL QUEUE
// ============================================

// View email queue
router.get('/email-outreach/queue', (req, res) => {
  try {
    const { status } = req.query;
    const queuedEmails = EmailQueueService.getAllQueued(status, 100);
    const stats = EmailQueueService.getQueueStats();

    // Get campaigns for queuing
    const campaigns = db.prepare('SELECT id, name FROM campaigns ORDER BY name').all();

    res.render('email-outreach/queue', {
      queuedEmails,
      stats,
      campaigns,
      filters: { status },
      user: req.session
    });
  } catch (error) {
    console.error('Error loading queue:', error);
    res.status(500).render('error', { error: 'Failed to load queue', user: req.session });
  }
});

// Get ready leads for queuing (AJAX)
router.get('/email-outreach/queue/ready-leads', (req, res) => {
  try {
    const { campaign_id } = req.query;
    const leads = EmailQueueService.getReadyLeads(campaign_id || null, 50);
    res.json({ success: true, leads });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add leads to queue
router.post('/email-outreach/queue/add', (req, res) => {
  try {
    const { lead_ids, email_ids, template_id } = req.body;

    if (!lead_ids || !email_ids || !template_id) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Parse arrays
    const leadIds = Array.isArray(lead_ids) ? lead_ids : [lead_ids];
    const emailIds = Array.isArray(email_ids) ? email_ids : [email_ids];

    const result = EmailQueueService.queueSelectedLeads(leadIds, emailIds, template_id);

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error adding to queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Queue campaign leads
router.post('/email-outreach/queue/campaign', (req, res) => {
  try {
    const { campaign_id, template_id, limit } = req.body;

    if (!campaign_id || !template_id) {
      return res.status(400).render('error', {
        error: 'Campaign and template are required',
        user: req.session
      });
    }

    const result = EmailQueueService.queueCampaignLeads(campaign_id, template_id, limit || null);

    res.redirect('/email-outreach/queue');
  } catch (error) {
    console.error('Error queuing campaign leads:', error);
    res.status(500).render('error', { error: 'Failed to queue leads: ' + error.message, user: req.session });
  }
});

// Clear pending queue
router.post('/email-outreach/queue/clear', (req, res) => {
  try {
    const result = EmailQueueService.clearQueue();
    res.redirect('/email-outreach/queue');
  } catch (error) {
    console.error('Error clearing queue:', error);
    res.status(500).render('error', { error: 'Failed to clear queue', user: req.session });
  }
});

// Delete queue item
router.post('/email-outreach/queue/:id/delete', (req, res) => {
  try {
    EmailQueueService.deleteQueueItem(req.params.id);
    res.redirect('/email-outreach/queue');
  } catch (error) {
    console.error('Error deleting queue item:', error);
    res.status(500).render('error', { error: 'Failed to delete queue item', user: req.session });
  }
});

// ============================================
// SMTP CONFIGURATION
// ============================================

// View SMTP config
router.get('/email-outreach/smtp', (req, res) => {
  try {
    const config = SmtpConfigRepo.getActive();
    const allConfigs = SmtpConfigRepo.getAll();

    res.render('email-outreach/smtp', {
      config,
      allConfigs,
      user: req.session
    });
  } catch (error) {
    console.error('Error loading SMTP config:', error);
    res.status(500).render('error', { error: 'Failed to load SMTP config', user: req.session });
  }
});

// Save SMTP config
router.post('/email-outreach/smtp/config', (req, res) => {
  try {
    const { host, port, secure, user, password, from_name, from_email } = req.body;

    if (!host || !port || !from_email) {
      return res.status(400).render('error', {
        error: 'Host, port, and from_email are required',
        user: req.session
      });
    }

    SmtpConfigRepo.create({
      host,
      port: parseInt(port),
      secure: secure === '1' || secure === true,
      user: user || '',
      password: password || '',
      from_name: from_name || '',
      from_email
    });

    res.redirect('/email-outreach/smtp');
  } catch (error) {
    console.error('Error saving SMTP config:', error);
    res.status(500).render('error', { error: 'Failed to save SMTP config: ' + error.message, user: req.session });
  }
});

// Test SMTP connection
router.post('/email-outreach/smtp/test', async (req, res) => {
  try {
    const result = await EmailService.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// EMAIL OUTREACH DASHBOARD
// ============================================

// Main dashboard
router.get('/email-outreach', (req, res) => {
  try {
    const stats = EmailService.getQueueStats();
    const templates = TemplateService.getActiveTemplates();
    const campaigns = db.prepare('SELECT id, name FROM campaigns ORDER BY name').all();

    res.render('email-outreach/index', {
      stats,
      templates,
      campaigns,
      user: req.session
    });
  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.status(500).render('error', { error: 'Failed to load dashboard', user: req.session });
  }
});

export default router;
