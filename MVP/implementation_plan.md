# Node.js Migration & Schema Design

The project is migrating from Python to **Node.js**.
The goal is to support multiple outreach strategies:

1.  **General City Search** (from `general approach.md`)
2.  **Blog-Specific Search** (from `blog-specific approach.md`)

## User Review Required

> [!IMPORTANT] > **Tech Stack Change**: Switching entirely to Node.js.
> **Database**: Using `better-sqlite3` for synchronous SQLite performance (simplified logic).
> **Input Logic**: The script will now parse _multiple_ input files with different formats.

## Proposed Schema (SQLite)

We will use a relational structure to track _where_ a lead came from.

### Tables

1.  **`campaigns`**
    - `id` (INTEGER PK)
    - `name` (TEXT) - e.g. "General City Search", "Enacton LMS Blog"
    - `target_url` (TEXT NULL) - The blog post URL we are promoting.
2.  **`prospects`**
    - `id` (INTEGER PK)
    - `domain` (TEXT UNIQUE) - Deduplication key (e.g., `example.com`)
    - `company_name` (TEXT)
    - `url` (TEXT) - The specific page found
    - `contact_email` (TEXT)
    - `contact_page` (TEXT)
    - `status` (TEXT) - 'NEW', 'ENRICHED', 'CONTACTED'
    - `created_at` (DATETIME)
3.  **`leads`** (Linking Prospects to Campaigns)
    - `id` (INTEGER PK)
    - `prospect_id` (FK)
    - `campaign_id` (FK)
    - `source_query` (TEXT) - The exact query used.

## Proposed Changes

### [NEW] Directory Structure `d:\OutReach\NodeMVP`

- `package.json`
- `src/db.js` (Database Init & Operations)
- `src/search_manager.js` (Replaces `backlink_manager.py`)
- `src/contact_extractor.js` (Replaces `contact_extractor.py`)
- `src/utils.js` (File parsing helpers)

### [NEW] [src/db.js](file:///d:/OutReach/NodeMVP/src/db.js)

- Implements the schema above using `better-sqlite3`.
- Exports helper functions: `saveProspect`, `getUnenrichedProspects`.

### [NEW] [src/search_manager.js](file:///d:/OutReach/NodeMVP/src/search_manager.js)

1.  **Load Inputs**:
    - Parse `general approach.md` -> Campaign "General City Search"
    - Parse `blog-specific approach.md` -> Multiple Campaigns (one per Blog URL).
2.  **Generate Queries**:
    - General: Keyword + City + Modifier
    - Blog-Specific: Blog Keyword + Modifier
3.  **Execute Search**:
    - Use `serpapi` Node package.
    - Deduplicate against `prospects.domain`.
    - Save to `prospects` and `leads`.

### [NEW] [src/contact_extractor.js](file:///d:/OutReach/NodeMVP/src/contact_extractor.js)

- Playwright logic in Node.js.
- Selects `prospects` where `contact_email` IS NULL.
- Updates DB.

## Verification Plan

1.  **Install**: `npm install`
2.  **Run Search**: `node src/search_manager.js` -> Verify DB population.
3.  **Run Extraction**: `node src/contact_extractor.js` -> Verify email updates.
