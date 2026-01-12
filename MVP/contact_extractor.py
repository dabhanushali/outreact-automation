import asyncio
import re
import sqlite3
from playwright.async_api import async_playwright
from pathlib import Path

DB_PATH = Path("d:/OutReach/MVP/backlinks.db")

# Regex for finding emails
EMAIL_REGEX = r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"

# Keywords to find contact pages
CONTACT_KEYWORDS = ["contact", "get in touch", "write for us", "about"]

async def find_emails_in_text(text):
    """Finds all unique emails in the given text."""
    if not text:
        return set()
    return set(re.findall(EMAIL_REGEX, text))

async def process_site(page, url):
    """
    Visits the site, looks for emails on Home, then tries Contact Us page.
    Returns (found_emails_list, contact_page_url)
    """
    found_emails = set()
    contact_page_url = None
    
    print(f"  Visiting: {url}")
    
    try:
        # 1. Visit Homepage
        try:
            await page.goto(url, timeout=15000) # 15s timeout
        except Exception as e:
            print(f"    Failed to load {url}: {e}")
            return [], None

        # Scrape Homepage Content
        content = await page.content()
        found_emails.update(await find_emails_in_text(content))
        
        # If emails found, great. But still check Contact Page for better ones? 
        # For MVP, if we found emails on Home, we might still want to check Contact Page if it's easy.
        
        # 2. Find Contact Page Link
        # Look for <a> tags containing specific text
        # simple heuristic: get all links, check text/href
        links = await page.evaluate('''
            () => Array.from(document.querySelectorAll('a')).map(a => ({
                text: a.innerText,
                href: a.href
            }))
        ''')
        
        candidate_links = []
        for link in links:
            txt = link['text'].lower()
            href = link['href'].lower()
            if any(k in txt or k in href for k in CONTACT_KEYWORDS):
                candidate_links.append(link['href'])
        
        if candidate_links:
            # Take the first best match (simplified)
            # Filter out same page anchors
            valid_contacts = [l for l in candidate_links if l.startswith('http') and l != url]
            
            if valid_contacts:
                contact_page_url = valid_contacts[0]
                print(f"    Found Contact Page: {contact_page_url}")
                
                # Visit Contact Page
                try:
                    await page.goto(contact_page_url, timeout=15000)
                    contact_content = await page.content()
                    found_emails.update(await find_emails_in_text(contact_content))
                except:
                    print(f"    Failed to load contact page.")

    except Exception as e:
        print(f"    Error processing {url}: {e}")
        
    return list(found_emails), contact_page_url

async def main():
    print("--- Contact Email Extractor (Playwright) ---")
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    
    # Fetch rows where email is NULL
    # We need to make sure the column exists first (backlink_manager.py should have handled it, 
    # but we can check or rely on the user running backlink_manager once to migration)
    try:
        rows = c.execute("SELECT id, company_name, url FROM prospects WHERE contact_email IS NULL").fetchall()
    except sqlite3.OperationalError:
        print("Error: 'contact_email' column not found. Please run backlink_manager.py at least once to migrate DB.")
        return

    print(f"Found {len(rows)} companies to process.")
    
    if not rows:
        return

    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        page = await context.new_page()
        
        for row in rows:
            company_id = row['id']
            company_name = row['company_name']
            url = row['url']
            
            print(f"\n[{company_id}] Processing {company_name}...")
            
            emails, contact_page = await process_site(page, url)
            
            email_str = ", ".join(emails) if emails else None
            contact_page_str = contact_page if contact_page else None
            
            if email_str:
                print(f"    > FOUND EMAILS: {email_str}")
                
                # Update DB
                c.execute("UPDATE prospects SET contact_email = ?, contact_page = ? WHERE id = ?", 
                          (email_str, contact_page_str, company_id))
                conn.commit()
            else:
                print("    > No emails found.")
                # Mark as processed? Maybe set to "NOT FOUND" to avoid re-scanning?
                # For MVP, let's leave NULL or set "NOT FOUND"
                c.execute("UPDATE prospects SET contact_email = 'NOT FOUND' WHERE id = ?", (company_id,))
                conn.commit()

        await browser.close()
        
    conn.close()
    print("\n--- Done ---")

if __name__ == "__main__":
    asyncio.run(main())
