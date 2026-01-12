import os
import sqlite3
import time
import datetime
from urllib.parse import urlparse
from pathlib import Path
from dotenv import load_dotenv
from serpapi import GoogleSearch

# Load environment variables
load_dotenv()

SERPAPI_KEY = os.getenv("SERPAPI_KEY")

DB_PATH = Path("d:/OutReach/MVP/backlinks.db")
CITY_FILE_PATH = Path("d:/OutReach/docs/general approach.md")

KEYWORDS = [
    "software development company",
    "IT services company",
    "web development agency"
]

MODIFIERS = [
    "write for us",
    "guest post",
    "submit guest post",
    "become a contributor"
]

def init_db():
    """Initialize SQLite database and creating prospects table if not exists."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS prospects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT,
            url TEXT UNIQUE,
            source_query TEXT,
            created_at DATETIME,
            contact_email TEXT,
            contact_page TEXT
        )
    ''')
    
    # Migration: Add columns if they don't exist (for existing DBs)
    try:
        c.execute("ALTER TABLE prospects ADD COLUMN contact_email TEXT")
    except sqlite3.OperationalError:
        pass # Column likely exists
        
    try:
        c.execute("ALTER TABLE prospects ADD COLUMN contact_page TEXT")
    except sqlite3.OperationalError:
        pass # Column likely exists
        
    conn.commit()
    return conn

def save_prospect(conn, company_name, url, source_query):
    """Save prospect to database. Ignore duplicates (URL or Company Name)."""
    try:
        c = conn.cursor()
        
        # Check for duplicate Company Name
        existing = c.execute("SELECT id FROM prospects WHERE company_name = ?", (company_name,)).fetchone()
        if existing:
            # print(f"  [SKIP] {company_name} (Duplicate Name)")
            return False

        created_at = datetime.datetime.now()
        c.execute('''
            INSERT INTO prospects (company_name, url, source_query, created_at)
            VALUES (?, ?, ?, ?)
        ''', (company_name, url, source_query, created_at))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        # URL already exists in DB
        return False
    except Exception as e:
        print(f"Error saving prospect: {e}")
        return False

def get_company_from_url(url):
    """Extracts a readable company name from the URL domain."""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc
        
        # Remove www.
        if domain.startswith("www."):
            domain = domain[4:]
            
        # Split by dot and take the first part (major simplification)
        # e.g., webdigitalmantra.in -> webdigitalmantra
        name = domain.split('.')[0]
        
        # Capitalize
        return name.title()
    except:
        return "Unknown"

def load_cities_from_file():
    """Parse cities from the general approach.md file."""
    cities = []
    if not CITY_FILE_PATH.exists():
        print(f"Error: City file not found at {CITY_FILE_PATH}")
        return []
    
    with open(CITY_FILE_PATH, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        if line.endswith(':'):
            continue
        if '"' in line or '+' in line:
            continue
            
        cities.append(line)
        
    return cities

def generate_queries(cities):
    """
    Generates search queries by combining Keywords + Cities + Modifiers.
    """
    queries = []
    for kw in KEYWORDS:
        for city in cities:
            base_term = f'{kw} "{city}"'
            for mod in MODIFIERS:
                query = f'{base_term} "{mod}"'
                queries.append(query)
                
    return queries

def run_search(conn, query):
    """
    Executes a search using SerpApi and saves results.
    Returns the number of NEW items added.
    """
    if not SERPAPI_KEY:
        print("Error: SERPAPI_KEY not found.")
        return 0

    print(f"\nScanning: {query}")
    
    params = {
        "engine": "google",
        "q": query,
        "api_key": SERPAPI_KEY,
        "num": 10
    }

    new_count = 0

    try:
        search = GoogleSearch(params)
        results = search.get_dict()
        
        if "error" in results:
            print(f"SerpApi Error: {results['error']}")
            return 0

        organic_results = results.get("organic_results", [])
        
        if not organic_results:
            print("  No organic results found.")
            return 0

        for result in organic_results:
            link = result.get("link")
            
            # Extract clean company name
            company_name = get_company_from_url(link)
            
            saved = save_prospect(conn, company_name, link, query)
            if saved:
                print(f"  [SAVED] {company_name} ({link})")
                new_count += 1
            else:
                pass # Duplicate

    except Exception as e:
        print(f"  An error occurred: {e}")
        
    return new_count

def main():
    print("--- MVP Backlink Prospecting Engine (SQLite Enabled) ---")
    
    conn = init_db()
    
    cities = load_cities_from_file()
    print(f"Loaded {len(cities)} cities from file.")
    
    queries = generate_queries(cities)
    print(f"Generated {len(queries)} total queries.")
    
    TOTAL_NEW_LIMIT = 10
    total_new_added = 0
    
    print(f"Starting search... logic will stop after adding {TOTAL_NEW_LIMIT} new companies.")
    
    for i, q in enumerate(queries):
        if total_new_added >= TOTAL_NEW_LIMIT:
            print("\n--- Daily Limit Reached (10 New Companies) ---")
            break
            
        new_added = run_search(conn, q)
        total_new_added += new_added
        
        if new_added > 0:
            print(f"  > Progress: {total_new_added}/{TOTAL_NEW_LIMIT} new companies added.")
        
        # Rate Limiting
        # Sleep 1.5 second to avoid rate limits
        time.sleep(1.5) 
        
    conn.close()
    print(f"\n--- Done. Total New Added: {total_new_added} ---")
    
    # Trigger Email Extraction
    print("\n[Workflow] Verification & Extraction Phase Starting...")
    try:
        import sys
        import subprocess
        # Use the same python interpreter to run the extractor script
        extractor_script = Path(__file__).parent / "contact_extractor.py"
        subprocess.run([sys.executable, str(extractor_script)], check=True)
    except Exception as e:
        print(f"[Workflow] Error running extractor: {e}")

if __name__ == "__main__":
    main()
