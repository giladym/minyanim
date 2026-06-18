type Level = "debug" | "info" | "warn" | "error";

/** Structured JSON logging → Cloudflare Workers Observability (no Winston; see ADR-0004). */
function emit(level: Level, message: string, fields?: Record<string, unknown>) {
  const line = JSON.stringify({ level, message, ts: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Create a logger bound to a request id (and any base fields). */
export function createLogger(base: Record<string, unknown> = {}) {
  return {
    debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, { ...base, ...f }),
    info: (m: string, f?: Record<string, unknown>) => emit("info", m, { ...base, ...f }),
    warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, { ...base, ...f }),
    error: (m: string, f?: Record<string, unknown>) => emit("error", m, { ...base, ...f }),
  };
}

export type Logger = ReturnType<typeof createLogger>;
