Automation Workflow: Backlink Outreach System

Objective: Automate the discovery, verification, and contact extraction of software development companies. 
Daily Goal: Add 100 verified companies per day to the outreach queue to ensure consistent volume. 
Target Output: A Master Sheet/Database populated with Company Names, URLs, and Contact Emails.

1. Input & Prerequisites
Before the script runs, the following inputs are required:

Target List (Seed Data):

Primary: Prime Cities (Ahmedabad, Mumbai, Bangalore, etc.).

Secondary: Directory URLs (e.g., Clutch.co list for "Top Developers in India").

Exclusion Database (Blacklist): A Master list of domains/emails we have already contacted to ensure Zero Duplication.

Competitor List (For Phase 2): A list of competitor domains to analyze for backlink opportunities later.

2. Core Workflow (The MVP)
This is the mandatory flow to replace the current manual work.

Step 1: Search & Discovery
The bot initiates a search to gather URLs. It should support two modes:

Mode A: Organic City Search

Action: Search Google/Bing for best software development company in [City Name].

Scraping: Extract organic results.

Mode B: Directory Scraping (Clutch, GoodFirms)

Action: Visit directory listings (e.g., clutch.co/in/developers/ahmedabad).

Scraping: Extract the "Website" link for every company listed on the profile pages.

Note: These leads are high quality, so prioritize processing them.

Deduplication Check (Critical):

Logic: IF (Domain exists in Exclusion Database) -> SKIP.

Else: Proceed to Step 2.

Step 2: Site Verification (AI/Keyword Check)
To ensure the site is relevant.

Visit Homepage: Headless browser (e.g., Playwright) loads the URL.

Content Analysis:

Simple Method: Scan for keywords: "Web Development," "App Development," "Services," "Agency."

Advanced Method (AI): Send text to LLM to verify: "Is this a software development agency?"

Decision:

If NO: Discard.

If YES: Proceed to Step 3.

Step 3: Email Extraction
Locate Contact Page: Look for links: "Contact," "Contact Us," "Get in Touch."

Scrape Data:

Visit the Contact Page.

Scan for visible email addresses (Regex for @domain.com).

Strict Rule: Only scrape visible text. No guessing.

Validation: Ensure the email domain matches the website domain (preferred).

Step 4: Data Storage & Limits
Write Data: Save to Master Sheet (City | Company | URL | Email | Status).

Daily Cap:

Counter: The script should count successful additions.

Stop Condition: Once 100 new companies are added for the day, the script stops or pauses.

Reasoning: Ensures we have enough volume to get replies, without overwhelming the email sender reputation.

3. Advanced Modules (Phase 2 & Future)
These features are to be built after the city-wise flow is stable.

Module A: Domain Authority (DA) Filtering
Logic to categorize leads for specific internal projects.

Action: Query SEO API (Moz/Semrush).

Logic:

DA > 25: Mark as "Tier 1" (Target for Main Website).

DA <= 25: Mark as "Tier 2" (Target for Proposal.biz / Douwin).

Module B: Automated Outreach
Trigger: When a row is added.

Action: Send template email based on Tier.

Handover: If reply received -> Human takes over.

Module C: Competitor Backlink Mining (Future Priority)
Targeting websites that link to our competitors.

Input: List of Competitor URLs.

Process:

Use SEO Tool API (Ahrefs/Semrush) to pull the "Backlink List" of a competitor.

Extract the Source URLs (the websites linking to them).

Integration: Feed these Source URLs into Step 2 (Site Verification) of the Core Workflow.

Logic: If they linked to a competitor, they are high-probability targets for us.

4. Technical Implementation Notes (For the Developer)
Handling Directories: Clutch and GoodFirms have strong anti-bot protection. You may need to rotate headers/User-Agents or use a specific scraping API for these specific sites.

Rate Limiting: To hit the 100/day target safely, space out requests. Do not burst 100 requests in 1 minute; spread them over a few hours.

Scalability: Ensure the "Exclusion Database" is fast. As we grow to thousands of rows, checking for duplicates shouldn't slow down the script.

Summary Flowchart Logic
START -> Select Source (City Search OR Clutch/GoodFirms OR Competitor Links)

LOOP until Daily Limit (100) is reached:

Get URL.

Is URL in DB? -> YES -> Skip.

NO -> Visit Site & Verify (Is it a Dev Agency?).

Extract Email from Contact Page.

(Optional) Filter by DA Score (>25 vs <25).

Save to DB.

(Optional) Send Outreach Email.

END LOOP
