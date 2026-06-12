/**
 * stderr-only logger.
 *
 * IMPORTANT: stdout is reserved for newline-delimited JSON-RPC messages on the
 * stdio transport. Writing anything else to stdout corrupts the protocol, so
 * all diagnostics must go to stderr.
 */
export function log(...args: unknown[]): void {
  const line = args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ");
  process.stderr.write(`[memories-mcp] ${line}\n`);
}
