import express from 'express';
import { ScriptExecutionService } from '../../services/ScriptExecutionService.js';

const router = express.Router();

// Get available scripts
router.get('/api/scripts', (req, res) => {
  res.json([
    {
      id: 'city',
      name: 'City Search',
      description: 'Search for prospects by city and keyword',
      icon: 'bi-building'
    },
    {
      id: 'directory',
      name: 'Directory Scraping',
      description: 'Scrape Clutch.co and GoodFirms directories',
      icon: 'bi-list-stars'
    },
    {
      id: 'blog',
      name: 'Blog Discovery',
      description: 'Find blog prospects using search modifiers',
      icon: 'bi-file-text'
    },
    {
      id: 'extract-emails',
      name: 'Email Extraction',
      description: 'Extract emails from unprocessed prospects',
      icon: 'bi-envelope'
    }
  ]);
});

// Get current script status/progress
router.get('/api/scripts/status', (req, res) => {
  try {
    const runningScript = ScriptExecutionService.getRunningScript();
    const recentLogs = ScriptExecutionService.getLatestLogs(5);

    res.json({
      running: runningScript || null,
      recent: recentLogs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get script logs by ID
router.get('/api/scripts/logs/:id', (req, res) => {
  try {
    const log = ScriptExecutionService.getLogById(req.params.id);
    if (!log) {
      return res.status(404).json({
        success: false,
        error: 'Log not found'
      });
    }
    res.json({ success: true, log });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Execute a script
router.post('/api/scripts/execute', async (req, res) => {
  const { script, limit, city, directory } = req.body;

  try {
    // Execute in background without waiting
    ScriptExecutionService.executeScript(script, { limit, city, directory })
      .then(result => {
        console.log(`Script ${script} completed:`, result);
      })
      .catch(error => {
        console.error(`Script ${script} failed:`, error);
      });

    res.json({
      success: true,
      message: `Script "${script}" started successfully`,
      script
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stop a running script
router.post('/api/scripts/stop', (req, res) => {
  try {
    const result = ScriptExecutionService.stopAllScripts();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
