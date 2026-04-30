import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const LOG_PATH = resolve(__dirname, '..', 'data', 'bot.log');

// Ensure data directory exists
mkdirSync(resolve(__dirname, '..', 'data'), { recursive: true });

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function timestamp(): string {
  return new Date().toISOString();
}

function formatArg(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.stack ?? a.message;
  try {
    return JSON.stringify(a, null, 2);
  } catch {
    return String(a);
  }
}

function formatArgs(args: unknown[]): string {
  return args.map(formatArg).join(' ');
}

function appendToLog(level: string, args: unknown[]): void {
  const line = `${timestamp()} [${level}] ${formatArgs(args)}\n`;
  try {
    appendFileSync(LOG_PATH, line);
  } catch {
    // If we can't write to the log file, don't crash the bot
  }
}

console.log = (...args: unknown[]) => {
  originalLog(...args);
  appendToLog('INFO', args);
};

console.error = (...args: unknown[]) => {
  originalError(...args);
  appendToLog('ERROR', args);
};

console.warn = (...args: unknown[]) => {
  originalWarn(...args);
  appendToLog('WARN', args);
};
