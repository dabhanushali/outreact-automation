import EmailTemplateRepo from '../repositories/EmailTemplateRepo.js';
import { db } from '../database/db.js';

class TemplateService {
  /**
   * Get all templates
   */
  static getAllTemplates() {
    return EmailTemplateRepo.getAll();
  }

  /**
   * Get active templates only
   */
  static getActiveTemplates() {
    return EmailTemplateRepo.getAll(true);
  }

  /**
   * Get template by ID
   */
  static getTemplate(id) {
    const template = EmailTemplateRepo.getById(id);
    if (template && template.variables) {
      try {
        template.variables = JSON.parse(template.variables);
      } catch (e) {
        template.variables = [];
      }
    }
    return template;
  }

  /**
   * Create new template
   */
  static createTemplate(data) {
    // Extract variables from template if not provided
    if (!data.variables) {
      data.variables = this.extractVariables(data.subject + ' ' + data.body);
    }

    return EmailTemplateRepo.create(data);
  }

  /**
   * Update template
   */
  static updateTemplate(id, data) {
    // Extract variables if body or subject changed
    if (data.subject || data.body && !data.variables) {
      const existing = this.getTemplate(id);
      const subject = data.subject || existing.subject;
      const body = data.body || existing.body;
      data.variables = this.extractVariables(subject + ' ' + body);
    }

    return EmailTemplateRepo.update(id, data);
  }

  /**
   * Delete template
   */
  static deleteTemplate(id) {
    return EmailTemplateRepo.delete(id);
  }

  /**
   * Extract variables from template text
   */
  static extractVariables(text) {
    const regex = /\{\{(\w+)\}\}/g;
    const variables = new Set();
    let match;

    while ((match = regex.exec(text)) !== null) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }

  /**
   * Render template with variables
   */
  static renderTemplate(template, variables) {
    let subject = template.subject;
    let body = template.body;

    // Define available variable mappings
    const variableMap = {
      name: variables.name || variables.contact_name || variables.first_name || '',
      company: variables.company_name || variables.company || '',
      domain: variables.domain || '',
      city: variables.city || '',
      country: variables.country || '',
      email: variables.email || variables.to_email || '',
      campaign: variables.campaign_name || variables.campaign || '',
      brand: variables.brand_name || variables.brand || '',
    };

    // Replace all {{variable}} placeholders
    for (const [key, value] of Object.entries(variableMap)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
      subject = subject.replace(regex, value || `{{${key}}}`);
      body = body.replace(regex, value || `{{${key}}}`);
    }

    return { subject, body };
  }

  /**
   * Prepare email for queue with variable substitution (for blog leads)
   */
  static prepareEmail(templateId, leadId, emailId) {
    // Get template
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Get blog lead data
    const leadData = db.prepare(`
      SELECT
        bl.id as lead_id,
        bl.campaign_id,
        bp.id as prospect_id,
        bp.blog_name as company_name,
        bp.domain,
        be.email as to_email,
        c.name as campaign_name,
        b.name as brand_name
      FROM blog_leads bl
      JOIN blog_prospects bp ON bl.blog_prospect_id = bp.id
      JOIN blog_emails be ON be.id = ?
      JOIN campaigns c ON bl.campaign_id = c.id
      JOIN brands b ON c.brand_id = b.id
      WHERE bl.id = ?
    `).get(emailId, leadId);

    if (!leadData) {
      throw new Error('Blog lead data not found');
    }

    // Render template with lead data
    const { subject, body } = this.renderTemplate(template, leadData);

    return {
      lead_id: leadId,
      email_id: emailId,
      template_id: templateId,
      to_email: leadData.to_email,
      subject,
      body,
    };
  }

  /**
   * Get available variables for reference
   */
  static getAvailableVariables() {
    return [
      { name: 'name', description: 'Recipient name (if available)' },
      { name: 'company', description: 'Blog name' },
      { name: 'domain', description: 'Blog domain' },
      { name: 'email', description: 'Recipient email address' },
      { name: 'campaign', description: 'Campaign name' },
      { name: 'brand', description: 'Brand name' },
    ];
  }

  /**
   * Preview template with sample data
   */
  static previewTemplate(templateId) {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    const sampleData = {
      name: 'John Doe',
      company_name: 'Acme Corporation',
      domain: 'acme.com',
      city: 'San Francisco',
      country: 'United States',
      email: 'john@acme.com',
      campaign_name: 'Software Development Outreach',
      brand_name: 'TechBrand',
    };

    return this.renderTemplate(template, sampleData);
  }
}

export default TemplateService;
