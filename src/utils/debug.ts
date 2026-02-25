/**
 * Development-only logging utilities
 * All log calls stripped from production builds
 */

const IS_DEV = import.meta.env.DEV;

export const debug = {
  /**
   * Log message (dev only)
   */
  log: IS_DEV ? console.log.bind(console) : () => {},

  /**
   * Warning message (dev only)
   */
  warn: IS_DEV ? console.warn.bind(console) : () => {},

  /**
   * Error message (always logged)
   */
  error: console.error.bind(console),

  /**
   * Grouped logs (dev only)
   */
  group: IS_DEV ? console.group.bind(console) : () => {},
  groupEnd: IS_DEV ? console.groupEnd.bind(console) : () => {},
};
