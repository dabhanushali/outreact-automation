import dotenv from "dotenv";
dotenv.config();

export const config = {
  // Campaign Defaults
  DEFAULT_DAILY_LIMIT: 100,

  // Search Settings
  SEARCH_ENGINE: "google", // 'google' or 'bing'
  SEARCH_RESULTS_PER_PAGE: 10,
  MAX_SEARCH_PAGES: 5,

  // Browser Settings
  HEADLESS: false, // Set to true in production
  USER_AGENT:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

  // Delays (in milliseconds)
  DELAY_BETWEEN_SEARCHES: { min: 5000, max: 15000 },
  DELAY_BETWEEN_PAGE_VISITS: { min: 3000, max: 8000 },

  // Verification
  KEYWORDS: {
    POSITIVE: [
      "software development",
      "web development",
      "app development",
      "mobile apps",
      "technology services",
      "digital agency",
    ],
    NEGATIVE: [
      "job",
      "career",
      "hiring",
      "salary",
      "indeed",
      "glassdoor",
      "linkedin",
    ],
  },

  // System
  DB_PATH: "outreach_system.db",
};

export const getRandomDelay = (range) => {
  return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
