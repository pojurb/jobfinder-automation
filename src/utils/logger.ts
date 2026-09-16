type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',  // gray
  info: '\x1b[36m',   // cyan
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
};

const RESET = '\x1b[0m';

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function formatTimestamp(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

let logCallbacks: ((level: LogLevel, msg: string) => void)[] = [];

export function addLogListener(cb: (level: LogLevel, msg: string) => void) {
  logCallbacks.push(cb);
}

export function removeLogListener(cb: (level: LogLevel, msg: string) => void) {
  logCallbacks = logCallbacks.filter(c => c !== cb);
}

function log(level: LogLevel, message: string, ...args: unknown[]): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel]) return;

  const timestamp = formatTimestamp();
  const color = LEVEL_COLORS[level];
  const label = level.toUpperCase().padEnd(5);
  const prefix = `${RESET}[${timestamp}] ${color}${label}${RESET}`;

  // Notify listeners
  let fullMessage = message;
  if (args.length > 0) {
    fullMessage += ' ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  }
  logCallbacks.forEach(cb => {
    try { cb(level, fullMessage); } catch (e) {}
  });

  if (args.length > 0) {
    console.log(`${prefix} ${message}`, ...args);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export const logger = {
  debug: (msg: string, ...args: unknown[]) => log('debug', msg, ...args),
  info: (msg: string, ...args: unknown[]) => log('info', msg, ...args),
  warn: (msg: string, ...args: unknown[]) => log('warn', msg, ...args),
  error: (msg: string, ...args: unknown[]) => log('error', msg, ...args),
};
