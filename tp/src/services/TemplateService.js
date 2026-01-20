import EmailTemplateRepo from "../repositories/EmailTemplateRepo.js";
import { db } from "../database/db.js";

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
      data.variables = this.extractVariables(data.subject + " " + data.body);
    }

    return EmailTemplateRepo.create(data);
  }

  /**
   * Update template
   */
  static updateTemplate(id, data) {
    // Extract variables if body or subject changed
    if (data.subject || (data.body && !data.variables)) {
      const existing = this.getTemplate(id);
      const subject = data.subject || existing.subject;
      const body = data.body || existing.body;
      data.variables = this.extractVariables(subject + " " + body);
    }

    return EmailTemplateRepo.update(id, data);
  }

  /**
   * Delete template
   */
  static deleteTemplate(id) {
    // Unlink from email_queue first (preserve sending history but remove template link)
    db.prepare(
      "UPDATE email_queue SET template_id = NULL WHERE template_id = ?"
    ).run(id);

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

    // formatting campaign name (e.g. "Blog: how-to-create-an-lms" -> "How To Create An Lms")
    let formattedCampaign = variables.campaign_name || variables.campaign || "";
    if (formattedCampaign.startsWith("Blog: ")) {
      formattedCampaign = formattedCampaign.replace("Blog: ", "");
    }
    // Replace hyphens with spaces and capitalize
    formattedCampaign = formattedCampaign
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    // Format company name: prefer domain-derived name if company_name looks like a title
    let companyShort = variables.company_name || variables.company || "";
    const domainVar = variables.domain || "";

    // Always try to derive a short name from the domain variable first, as it's cleaner
    if (domainVar) {
      // Extract name from domain (e.g. "zakratheme.com" -> "Zakratheme")
      const namePart = domainVar.split(".")[0];
      companyShort = namePart.charAt(0).toUpperCase() + namePart.slice(1);
    } else {
      // Logic for fallback ...
      // Heuristic: If company name:
      // 1. Is very long (>30 chars)
      // 2. Contains separators (" - ", " | ") indicating a page title
      // 3. Contains a dot "." indicating it's a domain name
      if (
        !companyShort ||
        companyShort.length > 30 ||
        companyShort.includes(" - ") ||
        companyShort.includes(" | ") ||
        companyShort.includes(".")
      ) {
        if (companyShort.includes(".")) {
          // Fallback: extract from companyName if it looks like a domain
          const namePart = companyShort.split(".")[0];
          companyShort = namePart.charAt(0).toUpperCase() + namePart.slice(1);
        }
      }
    }

    // Format campaign as link if URL exists
    let campaignLink = formattedCampaign;
    if (variables.target_url) {
      campaignLink = `<a href="${variables.target_url}">${formattedCampaign}</a>`;
    }

    // Define available variable mappings
    const variableMap = {
      name:
        variables.name || variables.contact_name || variables.first_name || "",
      company: variables.company_name || variables.company || "", // Full name
      company_short: companyShort, // Short name
      domain: companyShort, // Hack: User tends to use {{domain}} as short company name in templates
      city: variables.city || "",
      country: variables.country || "",
      email: variables.email || variables.to_email || "",
      campaign: campaignLink,
      brand: variables.brand_name || variables.brand || "",
    };

    // Replace all {{variable}} placeholders
    for (const [key, value] of Object.entries(variableMap)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "gi");
      subject = subject.replace(regex, value || `{{${key}}}`);
      body = body.replace(regex, value || `{{${key}}}`);
    }

    // Convert newlines to HTML breaks.
    // Logic: If the body contains BLOCK-LEVEL HTML tags (like <p>, <div>), we assume the user
    // is fully managing the layout and we shouldn't auto-convert newlines.
    // However, if they just use INLINE tags (like <strong>, <a>, <span>), we SHOULD still
    // convert newlines to <br> so the text doesn't collapse.
    const hasBlockHtml = /<\/?(p|div|ul|ol|table|tr|h[1-6]|blockquote)/i.test(
      body
    );

    if (!hasBlockHtml) {
      body = body.replace(/\n/g, "<br>");
    }

    return { subject, body };
  }

  /**
   * Prepare email for queue with variable substitution (for blog leads)
   */
  /**
   * Prepare email for queue with variable substitution (supports both blog and general leads)
   */
  static prepareEmail(templateId, leadId, emailId) {
    // Get template
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    console.log(
      `prepareEmail: Fetching data for Lead ${leadId}, Email ${emailId}`
    );

    // Determine if this is a Blog Lead or General Lead by checking where the email ID exists
    // 1. Check Blog Emails
    const blogEmailCheck = db
      .prepare("SELECT id, blog_prospect_id FROM blog_emails WHERE id = ?")
      .get(emailId);

    if (blogEmailCheck) {
      // --- BLOG LEAD PATH ---
      console.log(
        `prepareEmail: Email ${emailId} found in blog_emails. Processing as BLOG LEAD.`
      );
      const leadData = db
        .prepare(
          `
          SELECT
            bl.id as lead_id,
            bl.campaign_id,
            bp.id as prospect_id,
            COALESCE(bp.blog_name, bp.domain) as company_name,
            bp.domain,
            be.email as to_email,
            c.name as campaign_name,
            c.target_url,
            b.name as brand_name
          FROM blog_leads bl
          JOIN blog_prospects bp ON bl.blog_prospect_id = bp.id
          JOIN blog_emails be ON be.id = ?
          JOIN campaigns c ON bl.campaign_id = c.id
          JOIN brands b ON c.brand_id = b.id
          WHERE bl.id = ?
       `
        )
        .get(emailId, leadId);

      if (!leadData)
        throw new Error(
          `Blog lead data not found for Lead ${leadId}, Email ${emailId}`
        );

      const { subject, body } = this.renderTemplate(template, leadData);
      return {
        blog_lead_id: leadId,
        blog_email_id: emailId,
        lead_id: null,
        email_id: null,
        template_id: templateId,
        to_email: leadData.to_email,
        subject,
        body,
        email_category: template.email_category || 'main',
        sequence_number: template.sequence_number || 0,
      };
    }

    // 2. Check General Emails
    const generalEmailCheck = db
      .prepare("SELECT id, prospect_id FROM emails WHERE id = ?")
      .get(emailId);

    if (generalEmailCheck) {
      // --- GENERAL LEAD PATH ---
      console.log(
        `prepareEmail: Email ${emailId} found in emails. Processing as GENERAL LEAD.`
      );
      const leadData = db
        .prepare(
          `
          SELECT
            l.id as lead_id,
            l.campaign_id,
            p.id as prospect_id,
            p.company_name,
            p.domain,
            e.email as to_email,
            c.name as campaign_name,
            c.target_url,
            b.name as brand_name
          FROM leads l
          JOIN prospects p ON l.prospect_id = p.id
          JOIN emails e ON e.id = ?
          JOIN campaigns c ON l.campaign_id = c.id
          JOIN brands b ON c.brand_id = b.id
          WHERE l.id = ?
        `
        )
        .get(emailId, leadId);

      if (!leadData)
        throw new Error(
          `General lead data not found for Lead ${leadId}, Email ${emailId}`
        );

      const { subject, body } = this.renderTemplate(template, leadData);
      return {
        blog_lead_id: null,
        blog_email_id: null,
        lead_id: leadId,
        email_id: emailId,
        template_id: templateId,
        to_email: leadData.to_email,
        subject,
        body,
        email_category: template.email_category || 'main',
        sequence_number: template.sequence_number || 0,
      };
    }

    throw new Error(
      `Email ID ${emailId} not found in either blog_emails or emails tables.`
    );
  }

  /**
   * Get available variables for reference
   */
  static getAvailableVariables() {
    return [
      { name: "name", description: "Recipient name (if available)" },
      { name: "company", description: "Blog name" },
      { name: "domain", description: "Blog domain" },
      { name: "email", description: "Recipient email address" },
      { name: "campaign", description: "Campaign name" },
      { name: "brand", description: "Brand name" },
    ];
  }

  /**
   * Preview template with sample data
   */
  static previewTemplate(templateId) {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    const sampleData = {
      name: "John Doe",
      company_name: "Acme Corporation",
      domain: "acme.com",
      city: "San Francisco",
      country: "United States",
      email: "john@acme.com",
      campaign_name: "Software Development Outreach",
      target_url: "https://example.com/resource",
      brand_name: "TechBrand",
    };

    return this.renderTemplate(template, sampleData);
  }
}

export default TemplateService;
