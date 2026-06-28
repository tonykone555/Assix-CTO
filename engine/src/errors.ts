/**
 * Error handling utilities for the Assix automation engine.
 * Provides structured error classes, classification, and retry logic.
 */

import type { ActionError, ErrorSeverity } from "./types.js";

// Re-export for consumers that import errors
export type { ActionError } from "./types.js";

/**
 * Custom error class for automation action failures.
 * Carries structured metadata for logging and retry decisions.
 */
export class ActionFailedError extends Error {
  public readonly code: string;
  public readonly severity: ErrorSeverity;
  public readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    severity: ErrorSeverity = "recoverable",
    retryable = true,
  ) {
    super(message);
    this.name = "ActionFailedError";
    this.code = code;
    this.severity = severity;
    this.retryable = retryable;
  }
}

/**
 * Fatal — cannot proceed, no retry will help.
 */
export class FatalError extends ActionFailedError {
  constructor(code: string, message: string) {
    super(code, message, "fatal", false);
    this.name = "FatalError";
  }
}

/**
 * Transient — unlikely to succeed on immediate retry but may after a delay
 * (e.g. rate limiting, resource contention).
 */
export class TransientError extends ActionFailedError {
  constructor(code: string, message: string) {
    super(code, message, "transient", true);
    this.name = "TransientError";
  }
}

/** Convert an ActionFailedError (or generic Error) to a serializable ActionError */
export function toActionError(err: unknown): ActionError {
  if (err instanceof ActionFailedError) {
    return {
      code: err.code,
      message: err.message,
      severity: err.severity,
      retryable: err.retryable,
      stack: err.stack,
    };
  }

  if (err instanceof Error) {
    return {
      code: "UNKNOWN",
      message: err.message,
      severity: "recoverable",
      retryable: true,
      stack: err.stack,
    };
  }

  return {
    code: "UNKNOWN",
    message: String(err),
    severity: "recoverable",
    retryable: true,
  };
}

/** Common error codes */
export const ErrorCodes = {
  /** Navigation timed out or failed */
  NAVIGATION_FAILED: "NAVIGATION_FAILED",
  /** Selector did not match any element */
  SELECTOR_NOT_FOUND: "SELECTOR_NOT_FOUND",
  /** Element was not actionable (hidden, disabled, etc.) */
  ELEMENT_NOT_ACTIONABLE: "ELEMENT_NOT_ACTIONABLE",
  /** Browser crashed or disconnected */
  BROWSER_CRASHED: "BROWSER_CRASHED",
  /** Page closed unexpectedly */
  PAGE_CLOSED: "PAGE_CLOSED",
  /** Timeout exceeded */
  TIMEOUT: "TIMEOUT",
  /** Invalid parameters passed to action */
  INVALID_PARAMS: "INVALID_PARAMS",
  /** JavaScript evaluation failed */
  EVALUATION_FAILED: "EVALUATION_FAILED",
  /** Session not found or already closed */
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  /** Session limit reached */
  SESSION_LIMIT_REACHED: "SESSION_LIMIT_REACHED",
  /** File chooser failed */
  FILE_CHOOSER_FAILED: "FILE_CHOOSER_FAILED",
  /** Unsupported action type */
  UNSUPPORTED_ACTION: "UNSUPPORTED_ACTION",
  /** Browser launch failed */
  BROWSER_LAUNCH_FAILED: "BROWSER_LAUNCH_FAILED",
  /** Internal engine error */
  INTERNAL_ERROR: "INTERNAL_ERROR",
  /** Storage state save/load failure */
  STORAGE_STATE_FAILED: "STORAGE_STATE_FAILED",
} as const;

/**
 * Determine if an error from Playwright or Node.js matches a known error code.
 * This helps us classify throw errors even when they aren't our custom types.
 */
export function classifyPlaywrightError(err: unknown): ActionError {
  if (err instanceof ActionFailedError) {
    return toActionError(err);
  }

  const message = err instanceof Error ? err.message : String(err);

  // Timeout errors
  if (
    message.includes("Timeout") ||
    message.includes("timeout") ||
    message.includes("TimeoutError")
  ) {
    return {
      code: ErrorCodes.TIMEOUT,
      message,
      severity: "transient",
      retryable: true,
      stack: err instanceof Error ? err.stack : undefined,
    };
  }

  // Navigation errors
  if (
    message.includes("net::ERR_") ||
    message.includes("Navigation failed") ||
    message.includes("navigated")
  ) {
    return {
      code: ErrorCodes.NAVIGATION_FAILED,
      message,
      severity: "recoverable",
      retryable: true,
      stack: err instanceof Error ? err.stack : undefined,
    };
  }

  // Selector errors
  if (
    message.includes("selector") ||
    message.includes("waiting for element") ||
    message.includes("element") ||
    message.includes("no element") ||
    message.includes("not found")
  ) {
    return {
      code: ErrorCodes.SELECTOR_NOT_FOUND,
      message,
      severity: "recoverable",
      retryable: true,
      stack: err instanceof Error ? err.stack : undefined,
    };
  }

  // Actionability
  if (
    message.includes("actionability") ||
    message.includes("not visible") ||
    message.includes("hidden") ||
    message.includes("disabled")
  ) {
    return {
      code: ErrorCodes.ELEMENT_NOT_ACTIONABLE,
      message,
      severity: "recoverable",
      retryable: false,
      stack: err instanceof Error ? err.stack : undefined,
    };
  }

  // Browser crash
  if (
    message.includes("browser") ||
    message.includes("crash") ||
    message.includes("disconnected") ||
    message.includes("closed")
  ) {
    return {
      code: ErrorCodes.BROWSER_CRASHED,
      message,
      severity: "fatal",
      retryable: false,
      stack: err instanceof Error ? err.stack : undefined,
    };
  }

  // Fallback
  return {
    code: ErrorCodes.INTERNAL_ERROR,
    message,
    severity: "recoverable",
    retryable: true,
    stack: err instanceof Error ? err.stack : undefined,
  };
}

/**
 * Execute an async function with retry logic.
 * Only retries if the error is classified as retryable.
 *
 * @param fn - The async function to execute
 * @param options - Retry configuration
 * @returns The result of the function
 * @throws The last error if all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, error: ActionError, delayMs: number) => void;
    context?: string;
  } = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 500,
    maxDelayMs = 10_000,
    onRetry,
    context = "action",
  } = options;

  let lastError: ActionError | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const actionError = classifyPlaywrightError(err);
      lastError = actionError;

      if (!actionError.retryable || attempt >= maxRetries) {
        break;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * baseDelayMs,
        maxDelayMs,
      );

      if (onRetry) {
        onRetry(attempt, actionError, delay);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError
    ? new ActionFailedError(
        lastError.code,
        `${context} failed after ${maxRetries} retries: ${lastError.message}`,
        lastError.severity,
        false,
      )
    : new ActionFailedError(
        ErrorCodes.INTERNAL_ERROR,
        `${context} failed after ${maxRetries} retries (unknown error)`,
        "fatal",
        false,
      );
}

/** Format an ActionError for logging */
export function formatError(error: ActionError): string {
  return `[${error.code}] (${error.severity}) ${error.message}${error.retryable ? " [retryable]" : ""}`;
}

/** Group action errors by code for dashboard/metrics */
export function groupErrors(errors: ActionError[]): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const e of errors) {
    groups[e.code] = (groups[e.code] ?? 0) + 1;
  }
  return groups;
}