import { search } from "google-sr";
import { db, isDomainExcluded } from "../database/db.js";
import Logger from "../core/logger.js";
import { config, sleep, getRandomDelay } from "../core/config.js";

const logger = new Logger("search-service");

/**
 * Executes a search for a campaign query and processes results.
 * @param {Object} campaign - The campaign object
 * @param {string} queryText - The query string
 * @returns {Promise<Array>} - List of valid prototype objects
 */
export async function performSearch(campaign, queryText) {
  logger.info(`Starting search for: "${queryText}"`);

  let allResults = [];
  let page = 0;

  // We'll try to fetch enough pages to find fresh leads
  while (page < config.MAX_SEARCH_PAGES) {
    try {
      logger.debug(`Fetching search page ${page + 1}...`);

      // Search execution
      const results = await search({
        query: queryText,
        page: page,
        safeMode: false,
        // google-sr specific options might vary, but basic query/page is standard
      });

      if (!results || results.length === 0) {
        logger.warn("No results found for this page.");
        break;
      }

      // Process results
      const validResults = results
        .filter((result) => {
          // We only care about organic results with a link
          return result.link && !result.promoted;
        })
        .map((result) => {
          try {
            const urlObj = new URL(result.link);
            return {
              url: result.link,
              domain: urlObj.hostname,
              title: result.title,
              description: result.description,
            };
          } catch (e) {
            return null;
          }
        })
        .filter((item) => item !== null);

      // Deduplication & Exclusion Check
      for (const item of validResults) {
        // 1. Check Global Exclusions
        if (isDomainExcluded(item.domain)) {
          logger.debug(`Skipping excluded domain: ${item.domain}`);
          continue;
        }

        // 2. Check if already in prospects (optional optimization to avoid re-crawling known bad prospects)
        // For now, we'll let the main loop handle deep logical checks,
        // but we definitely want to avoid adding duplicates within this single run.
        if (!allResults.find((r) => r.domain === item.domain)) {
          allResults.push(item);
        }
      }

      // Artificial delay to be polite to Google
      await sleep(getRandomDelay(config.DELAY_BETWEEN_SEARCHES));

      page++;
    } catch (error) {
      logger.error("Search failed", error);
      break;
    }
  }

  logger.info(`Found ${allResults.length} unique potential leads.`);
  return allResults;
}
