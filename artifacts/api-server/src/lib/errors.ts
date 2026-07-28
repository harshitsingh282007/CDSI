// Shared error helpers

/** Extract a human-readable message from an unknown thrown value. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Error message exposed only outside production, otherwise undefined. */
export function devErrorDetails(e: unknown): string | undefined {
  return process.env.NODE_ENV === "development" ? errorMessage(e) : undefined;
}
