-- Migration: Rename city_id to location_id in search_queries table
-- This changes "city" terminology to "location" in search context

BEGIN TRANSACTION;

-- Add new location_id column
ALTER TABLE search_queries ADD COLUMN location_id INTEGER;

-- Copy data from city_id to location_id
UPDATE search_queries SET location_id = city_id;

-- Create new foreign key to cities (keeping cities table as the source)
-- The cities table represents locations
-- Note: SQLite doesn't support ALTER TABLE to drop columns or add foreign keys directly
-- We'll handle the foreign key recreation by recreating the table

-- Create new table with location_id
CREATE TABLE search_queries_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  query TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(keyword_id, location_id),
  FOREIGN KEY (keyword_id) REFERENCES outreach_keywords(id),
  FOREIGN KEY (location_id) REFERENCES cities(id)
);

-- Copy data to new table
INSERT INTO search_queries_new (id, keyword_id, location_id, query, created_at)
SELECT id, keyword_id, location_id, query, created_at
FROM search_queries;

-- Drop old table
DROP TABLE search_queries;

-- Rename new table to original name
ALTER TABLE search_queries_new RENAME TO search_queries;

COMMIT;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_search_queries_keyword ON search_queries(keyword_id);
CREATE INDEX IF NOT EXISTS idx_search_queries_location ON search_queries(location_id);
