import { spawn } from 'child_process';
import path from 'path';
import { db } from '../database/db.js';

export class ScriptExecutionService {
  static executeScript(mode = 'city', options = {}) {
    return new Promise((resolve, reject) => {
      // Create initial log entry
      const logInfo = db.prepare(`
        INSERT INTO script_execution_logs (script_type, status, message, progress)
        VALUES (?, 'running', ?, 0)
      `).run(mode, `Starting ${mode} script...`);

      const logId = logInfo.lastInsertRowid;
      console.log('[ScriptExecutionService] Created log entry:', logId);

      const scriptPath = path.resolve('run-outreach.js');
      const args = ['--mode=' + mode];

      if (options.limit) {
        args.push('--limit=' + options.limit);
      }

      if (options.city) {
        args.push('--city=' + options.city);
      }

      if (options.directory) {
        args.push('--directory=' + options.directory);
      }

      console.log('Executing script:', 'node', scriptPath, ...args);

      const process = spawn('node', [scriptPath, ...args], {
        cwd: path.resolve(),
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let lastMessage = '';
      let progress = 0;

      // Update log with progress every second
      const progressInterval = setInterval(() => {
        if (lastMessage) {
          db.prepare(`
            UPDATE script_execution_logs
            SET message = ?, progress = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(lastMessage.slice(0, 500), progress, logId);
        }
      }, 1000);

      process.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        lastMessage = output.trim();
        console.log('[Script stdout]', output);

        // Try to extract progress from output
        // Look for patterns like "Found 5 prospects", "Processed 10/100", etc.
        const progressMatch = output.match(/(\d+)\/(\d+)/);
        if (progressMatch) {
          progress = Math.round((parseInt(progressMatch[1]) / parseInt(progressMatch[2])) * 100);
        }
      });

      process.stderr.on('data', (data) => {
        const error = data.toString();
        stderr += error;
        lastMessage = 'Error: ' + error.trim();
        console.error('[Script stderr]', error);
      });

      process.on('close', (code) => {
        clearInterval(progressInterval);

        const finalStatus = code === 0 ? 'completed' : 'failed';
        const finalMessage = code === 0
          ? `${mode} script completed successfully`
          : `${mode} script failed with code ${code}`;

        db.prepare(`
          UPDATE script_execution_logs
          SET status = ?, message = ?, progress = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(finalStatus, finalMessage.slice(0, 500), code === 0 ? 100 : progress, logId);

        console.log('[ScriptExecutionService] Updated log entry:', logId, finalStatus);

        if (code === 0) {
          resolve({ stdout, stderr, code, logId });
        } else {
          reject({ stdout, stderr, code, logId });
        }
      });

      process.on('error', (error) => {
        clearInterval(progressInterval);
        db.prepare(`
          UPDATE script_execution_logs
          SET status = 'failed', message = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run('Process error: ' + error.message.slice(0, 450), logId);

        reject({ error: error.message, stderr, stdout, logId });
      });
    });
  }

  static async executeCitySearch(limit = 100) {
    return this.executeScript('city', { limit });
  }

  static async executeDirectorySearch(limit = 100) {
    return this.executeScript('directory', { limit });
  }

  static async executeBlogSearch(limit = 100) {
    return this.executeScript('blog', { limit });
  }

  static async executeEmailExtraction(limit = 100) {
    return this.executeScript('extract-emails', { limit });
  }

  static getLatestLogs(limit = 10) {
    return db.prepare(`
      SELECT * FROM script_execution_logs
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  }

  static getLogById(logId) {
    return db.prepare(`
      SELECT * FROM script_execution_logs WHERE id = ?
    `).get(logId);
  }

  static getRunningScript() {
    return db.prepare(`
      SELECT * FROM script_execution_logs
      WHERE status = 'running'
      ORDER BY created_at DESC
      LIMIT 1
    `).get();
  }
}
