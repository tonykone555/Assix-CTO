/**
 * @assix/automation-engine
 *
 * Core automation engine for the Assix live-preview browser automation platform.
 *
 * Provides:
 *  - SessionManager: Manage multiple concurrent browser sessions
 *  - BrowserAutomation: Execute actions on a page with robust error handling
 *  - ScreenshotStream: Adaptive-quality screenshot streaming
 *  - Comprehensive type system for actions, configs, and errors
 *  - Error classification and retry logic
 */

export { SessionManager } from "./SessionManager.js";
export type { SessionLifecycleCallbacks } from "./SessionManager.js";
export { BrowserAutomation } from "./BrowserAutomation.js";
export { ScreenshotStream } from "./ScreenshotStream.js";
export type { ScreenshotFrame, ScreenshotFrameCallback, StreamConfig } from "./ScreenshotStream.js";
export {
  ActionFailedError,
  FatalError,
  TransientError,
  ErrorCodes,
  classifyPlaywrightError,
  formatError,
  groupErrors,
  toActionError,
  withRetry,
} from "./errors.js";
export type {
  ActionError,
  ActionParams,
  ActionResult,
  ActionType,
  BrowserType,
  ErrorSeverity,
  ExecutionState,
  ExecutionStatus,
  LogLevel,
  QualityPreset,
  QueuedAction,
  SessionConfig,
  SessionInfo,
  Workflow,
} from "./types.js";
export { DEFAULT_SESSION_CONFIG } from "./types.js";