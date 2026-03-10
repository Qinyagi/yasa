/**
 * YASA Logging Module
 * DEV: console.* output
 * PROD: noop (minimal overhead)
 */

const isDev = __DEV__;

const PREFIX = '[YASA]';

export function logInfo(tag: string, message: string, data?: unknown): void {
  if (isDev) {
    console.log(`${PREFIX} ${tag}: ${message}`, data !== undefined ? data : '');
  }
}

export function logWarn(tag: string, message: string, data?: unknown): void {
  if (isDev) {
    console.warn(`${PREFIX} ${tag}: ${message}`, data !== undefined ? data : '');
  }
}

export function logError(tag: string, message: string, error?: unknown): void {
  if (isDev) {
    console.error(`${PREFIX} ${tag}: ${message}`, error !== undefined ? error : '');
  }
}
