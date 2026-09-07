// Structured logger for KK-UI-GOVERNOR. Writes human lines to stderr and keeps an in-memory log
// so every transaction report can embed the exact sequence of events.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

export class Logger {
  constructor({ level = process.env.KKGOV_LOG_LEVEL || 'info', prefix = 'kkgov', sink = null } = {}) {
    this.level = LEVELS[level] ?? LEVELS.info;
    this.prefix = prefix;
    this.entries = [];
    this.sink = sink; // optional function(entry)
  }
  child(prefix) {
    const c = new Logger({ prefix: `${this.prefix}:${prefix}` });
    c.level = this.level;
    c.entries = this.entries; // share history
    c.sink = this.sink;
    return c;
  }
  _log(level, msg, data) {
    const entry = { ts: new Date().toISOString(), level, prefix: this.prefix, msg, ...(data ? { data } : {}) };
    this.entries.push(entry);
    if (this.sink) this.sink(entry);
    if (LEVELS[level] >= this.level) {
      const line = `[${entry.ts}] ${level.toUpperCase().padEnd(5)} ${this.prefix} ${msg}${data ? ' ' + safeJson(data) : ''}`;
      process.stderr.write(line + '\n');
    }
  }
  debug(m, d) { this._log('debug', m, d); }
  info(m, d) { this._log('info', m, d); }
  warn(m, d) { this._log('warn', m, d); }
  error(m, d) { this._log('error', m, d); }
}

export function safeJson(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

export const defaultLogger = new Logger();
