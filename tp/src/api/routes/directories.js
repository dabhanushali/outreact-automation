import express from "express";
import DirectoryRepo from "../../repositories/DirectoryRepo.js";
import { db } from "../../database/db.js";

const router = express.Router();

// List all directories with filters
router.get("/directories", (req, res) => {
  try {
    const { platform, country, is_active } = req.query;

    const filters = {};
    if (platform) filters.platform = platform;
    if (country) filters.country = country;
    if (is_active !== undefined && is_active !== "") filters.is_active = is_active === "true" || is_active === "1";

    const directories = DirectoryRepo.getAll(filters);
    const stats = DirectoryRepo.getStats();
    const platforms = DirectoryRepo.getPlatforms();
    const countries = DirectoryRepo.getCountries();

    res.render("directories/list", {
      directories,
      stats,
      platforms,
      countries,
      filters: { platform, country, is_active },
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading directories:", error);
    res.status(500).render("error", {
      error: "Failed to load directories: " + error.message,
      user: req.session,
    });
  }
});

// View single directory
router.get("/directories/:id", (req, res) => {
  try {
    const directory = DirectoryRepo.getById(req.params.id);

    if (!directory) {
      return res.status(404).render("error", {
        error: "Directory not found",
        user: req.session,
      });
    }

    res.render("directories/detail", {
      directory,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading directory details:", error);
    res.status(500).render("error", {
      error: "Failed to load directory details: " + error.message,
      user: req.session,
    });
  }
});

// Create directory form (hidden, used via modal or separate page)
router.get("/directories/new", (req, res) => {
  try {
    const platforms = DirectoryRepo.getPlatforms();
    const countries = DirectoryRepo.getCountries();

    res.render("directories/form", {
      directory: null,
      platforms,
      countries,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading directory form:", error);
    res.status(500).render("error", {
      error: "Failed to load directory form: " + error.message,
      user: req.session,
    });
  }
});

// Edit directory form
router.get("/directories/:id/edit", (req, res) => {
  try {
    const directory = DirectoryRepo.getById(req.params.id);

    if (!directory) {
      return res.status(404).render("error", {
        error: "Directory not found",
        user: req.session,
      });
    }

    const platforms = DirectoryRepo.getPlatforms();
    const countries = DirectoryRepo.getCountries();

    res.render("directories/form", {
      directory,
      platforms,
      countries,
      user: req.session,
    });
  } catch (error) {
    console.error("Error loading directory edit form:", error);
    res.status(500).render("error", {
      error: "Failed to load directory edit form: " + error.message,
      user: req.session,
    });
  }
});

// Create directory
router.post("/directories", (req, res) => {
  try {
    const { name, url, platform, country, city, category } = req.body;

    // Basic validation
    if (!name || !url || !platform) {
      return res.status(400).render("error", {
        error: "Name, URL, and Platform are required",
        user: req.session,
      });
    }

    DirectoryRepo.create({ name, url, platform, country, city, category });

    res.redirect("/directories");
  } catch (error) {
    console.error("Error creating directory:", error);
    res.status(500).render("error", {
      error: "Failed to create directory: " + error.message,
      user: req.session,
    });
  }
});

// Import directories from CSV (must come before /:id routes)
router.post("/directories/import-csv", async (req, res) => {
  try {
    console.log("=== DIRECTORY IMPORT START ===");
    console.log("Request body:", req.body);

    const { csv_url } = req.body;

    if (!csv_url) {
      return res.status(400).render("error", {
        error: "CSV URL is required",
        user: req.session,
      });
    }

    console.log(`Importing directories from: ${csv_url}`);

    let targetUrl = csv_url;
    // Auto-fix Google Sheet edit URLs to export CSV format
    if (
      targetUrl.includes("docs.google.com/spreadsheets") &&
      targetUrl.includes("/edit")
    ) {
      targetUrl = targetUrl.replace(/\/edit.*$/, "/export?format=csv");
      console.log(`Auto-corrected Google Sheet URL to: ${targetUrl}`);
    }

    // Fetch CSV
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch sheet: ${response.status} ${response.statusText}`
      );
    }
    const csvText = await response.text();

    // Check for HTML content (common when sheet is not public)
    if (csvText.includes("<!DOCTYPE html") || csvText.includes("<html")) {
      return res.status(400).render("error", {
        error:
          'Invalid CSV: The link returned a webpage instead of a CSV. Please make sure the Google Sheet is "Published to the Web" (File > Share > Publish to web) or visible to anyone with the link.',
        user: req.session,
      });
    }

    const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length === 0) {
      return res.redirect("/directories?error=empty_sheet");
    }

    // Simple CSV parser that handles quoted values
    function parseCSVLine(line) {
      const result = [];
      let current = "";
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current);
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current);
      return result;
    }

    // Determine column indices from header
    const headers = parseCSVLine(lines[0])
      .map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());

    // Support flexible column names
    const nameCol = headers.findIndex(h => ["name", "directory", "directory name", "site", "website"].includes(h));
    const urlCol = headers.findIndex(h => ["url", "link", "website url", "site url"].includes(h));
    const platformCol = headers.findIndex(h => ["platform", "type", "source"].includes(h));
    const categoryCol = headers.findIndex(h => ["category", "categories"].includes(h));
    const countryCol = headers.findIndex(h => ["country", "countries"].includes(h));
    const cityCol = headers.findIndex(h => ["city", "cities", "location", "locations"].includes(h));

    console.log(`Import Debug: Headers: [${headers.join(", ")}]`);
    console.log(`Import Debug: Name col: ${nameCol}, URL col: ${urlCol}, Platform col: ${platformCol}`);

    if (nameCol === -1 || urlCol === -1 || platformCol === -1) {
      return res.status(400).render("error", {
        error: `CSV must have Name, URL, and Platform columns. Found: [${headers.join(", ")}]`,
        user: req.session,
      });
    }

    let added = 0;
    let skipped = 0;
    const errors = [];

    db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);

        const name = cols[nameCol]?.trim().replace(/^"|"$/g, "");
        const url = cols[urlCol]?.trim().replace(/^"|"$/g, "");
        const platform = cols[platformCol]?.trim().replace(/^"|"$/g, "").toLowerCase();
        const category = categoryCol >= 0 ? cols[categoryCol]?.trim().replace(/^"|"$/g, "") : null;
        const country = countryCol >= 0 ? cols[countryCol]?.trim().replace(/^"|"$/g, "") : null;
        const city = cityCol >= 0 ? cols[cityCol]?.trim().replace(/^"|"$/g, "") : null;

        if (!name || !url || !platform) {
          if (skipped < 5) {
            console.log(`Import Debug: Skipped row ${i}: missing required fields`);
          }
          skipped++;
          continue;
        }

        // Validate platform
        if (!["clutch", "goodfirms", "other"].includes(platform)) {
          if (errors.length < 5) {
            errors.push(`Row ${i + 1}: Invalid platform "${platform}"`);
          }
          skipped++;
          continue;
        }

        try {
          DirectoryRepo.create({ name, url, platform, category, country, city });
          added++;
        } catch (err) {
          // Skip duplicates or invalid entries
          skipped++;
        }
      }
    })();

    console.log(`Import Result: Added ${added}, Skipped ${skipped}`);

    if (added === 0) {
      return res.status(400).render("error", {
        error: "No valid directories were imported. Please check the CSV format.",
        user: req.session,
      });
    }

    res.redirect(`/directories?success=imported_${added}`);
  } catch (error) {
    console.error("Error importing directories:", error);
    res.status(500).render("error", {
      error: "Failed to import directories: " + error.message,
      user: req.session,
    });
  }
});

// Update directory
router.post("/directories/:id", (req, res) => {
  try {
    const id = req.params.id;
    const { name, url, platform, country, city, category, is_active } = req.body;

    const data = {};
    if (name !== undefined) data.name = name;
    if (url !== undefined) data.url = url;
    if (platform !== undefined) data.platform = platform;
    if (country !== undefined) data.country = country;
    if (city !== undefined) data.city = city;
    if (category !== undefined) data.category = category;
    if (is_active !== undefined) data.is_active = is_active === "true" || is_active === "1" || is_active === true;

    const updated = DirectoryRepo.update(id, data);

    if (!updated) {
      return res.status(404).render("error", {
        error: "Directory not found",
        user: req.session,
      });
    }

    res.redirect("/directories");
  } catch (error) {
    console.error("Error updating directory:", error);
    res.status(500).render("error", {
      error: "Failed to update directory: " + error.message,
      user: req.session,
    });
  }
});

// Toggle active status
router.post("/directories/:id/toggle", (req, res) => {
  try {
    const directory = DirectoryRepo.toggleActive(req.params.id);

    if (!directory) {
      return res.status(404).json({ success: false, error: "Directory not found" });
    }

    res.json({ success: true, directory });
  } catch (error) {
    console.error("Error toggling directory:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete directory
router.post("/directories/:id/delete", (req, res) => {
  try {
    const deleted = DirectoryRepo.delete(req.params.id);

    if (!deleted) {
      return res.status(404).render("error", {
        error: "Directory not found",
        user: req.session,
      });
    }

    res.redirect("/directories");
  } catch (error) {
    console.error("Error deleting directory:", error);
    res.status(500).render("error", {
      error: "Failed to delete directory: " + error.message,
      user: req.session,
    });
  }
});

// Bulk toggle active
router.post("/directories/bulk-toggle", (req, res) => {
  try {
    const { directory_ids, is_active } = req.body;

    if (!Array.isArray(directory_ids) || directory_ids.length === 0) {
      return res.json({ success: false, error: "No directories selected" });
    }

    const activeValue = is_active === "true" || is_active === true || is_active === 1;
    let count = 0;

    for (const id of directory_ids) {
      const result = DirectoryRepo.update(id, { is_active: activeValue });
      if (result) count++;
    }

    res.json({ success: true, updated: count });
  } catch (error) {
    console.error("Error bulk toggling directories:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk delete
router.post("/directories/bulk-delete", (req, res) => {
  try {
    const { directory_ids } = req.body;

    if (!Array.isArray(directory_ids) || directory_ids.length === 0) {
      return res.json({ success: false, error: "No directories selected" });
    }

    let count = 0;
    for (const id of directory_ids) {
      if (DirectoryRepo.delete(id)) count++;
    }

    res.json({ success: true, deleted: count });
  } catch (error) {
    console.error("Error bulk deleting directories:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get active directory URLs for scraping
router.get("/api/directories/active", (req, res) => {
  try {
    const { platform, country } = req.query;

    const filters = { is_active: true };
    if (platform) filters.platform = platform;
    if (country) filters.country = country;

    const directories = DirectoryRepo.getAll(filters);

    res.json({
      success: true,
      directories: directories.map((d) => ({
        id: d.id,
        name: d.name,
        url: d.url,
        platform: d.platform,
        country: d.country,
        city: d.city,
      })),
    });
  } catch (error) {
    console.error("Error getting active directories:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
