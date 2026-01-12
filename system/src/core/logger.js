import fs from "fs";
import path from "path";
import { db, log as dbLog } from "../database/db.js";

// Ensure logs directory exists
// const logDir = path.resolve('logs');
// if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const LogLevel = {
  INFO: "info",
  WARN: "warning",
  ERROR: "error",
  DEBUG: "debug",
};

class Logger {
  constructor(moduleName) {
    this.module = moduleName;
  }

  info(message, data = null) {
    this._log(LogLevel.INFO, message, data);
  }

  warn(message, data = null) {
    this._log(LogLevel.WARN, message, data);
  }

  error(message, data = null) {
    this._log(LogLevel.ERROR, message, data);
  }

  debug(message, data = null) {
    this._log(LogLevel.DEBUG, message, data);
  }

  _log(level, message, data) {
    // 1. Console Output
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.module}]`;

    if (level === LogLevel.ERROR) {
      console.error(prefix, message, data || "");
    } else {
      console.log(prefix, message, data || "");
    }

    // 2. Database Logging (Async/Fire-and-forget to avoid blocking)
    try {
      dbLog(level, this.module, message, data);
    } catch (err) {
      console.error("Failed to write to DB log:", err);
    }
  }
}

export default Logger;
