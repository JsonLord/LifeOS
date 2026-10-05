export class StoreConfigurationError extends Error { name = "StoreConfigurationError" }
export class StoreRequestError extends Error {
  name = "StoreRequestError";
  constructor(message: string, readonly status?: number) { super(message); }
}
export class StoreOperationError extends Error { name = "StoreOperationError" }

/** Never pass remote response bodies, headers, URLs, or credentials to callers. */
export function sanitizedRequestError(status?: number): StoreRequestError {
  return new StoreRequestError(`Notion request failed${status ? ` (HTTP ${status})` : ""}`, status);
}
