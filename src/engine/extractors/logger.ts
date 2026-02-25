/**
 * Structured logging for extractors
 * Phase 2: Consistent logging format across all extractors
 */

import type { LogEntry } from "../../types/extractors.types";

/**
 * Logger instance for extractors
 */
class ExtractorLogger {
  private entries: LogEntry[] = [];

  /**
   * Log an info message
   */
  info(extractor: string, action: string, metadata?: Record<string, unknown>): void {
    this.log("info", extractor, action, metadata);
  }

  /**
   * Log a warning message
   */
  warn(extractor: string, action: string, metadata?: Record<string, unknown>): void {
    this.log("warn", extractor, action, metadata);
  }

  /**
   * Log an error message
   */
  error(extractor: string, action: string, metadata?: Record<string, unknown>): void {
    this.log("error", extractor, action, metadata);
  }

  /**
   * Log a debug message
   */
  debug(extractor: string, action: string, metadata?: Record<string, unknown>): void {
    this.log("debug", extractor, action, metadata);
  }

  /**
   * Log with duration
   */
  timed(
    level: "info" | "warn" | "error" | "debug",
    extractor: string,
    action: string,
    startTime: number,
    metadata?: Record<string, unknown>
  ): void {
    const duration = Date.now() - startTime;
    this.log(level, extractor, action, { ...metadata, duration });
  }

  /**
   * Internal log method
   */
  private log(
    level: "info" | "warn" | "error" | "debug",
    extractor: string,
    action: string,
    metadata?: Record<string, unknown>
  ): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      extractor,
      action,
      ...metadata,
    };

    this.entries.push(entry);

    // Format message for console
    const message = `[${extractor}] ${action}`;
    const logData = metadata ? { ...metadata } : {};

    switch (level) {
      case "info":
        console.log(message, logData);
        break;
      case "warn":
        console.warn(message, logData);
        break;
      case "error":
        console.error(message, logData);
        break;
      case "debug":
        console.debug(message, logData);
        break;
    }
  }

  /**
   * Get all log entries
   */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Clear log entries
   */
  clear(): void {
    this.entries = [];
  }
}

// Export singleton instance
export const extractorLogger = new ExtractorLogger();
