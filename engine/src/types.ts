/**
 * Core type definitions for the Assix automation engine.
 */

import type { Browser, BrowserContext, Page } from "playwright";

/** Supported browser types */
export type BrowserType = "chromium" | "firefox" | "webkit";

/** Resolution / quality preset for screenshots */
export type QualityPreset = "low" | "medium" | "high" | "ultra";

/** Verbosity of action logs */
export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

/**
 * Configuration for a single browser session.
 */
export interface SessionConfig {
  /** Browser engine to launch */
  browserType?: BrowserType;
  /** Whether to run headlessly (default: true) */
  headless?: boolean;
  /** Viewport dimensions */
  viewport?: { width: number; height: number };
  /** Locale for the browser */
  locale?: string;
  /** Timezone */
  timezone?: string;
  /** Extra HTTP headers to set on every request */
  extraHeaders?: Record<string, string>;
  /** Proxy server URL (e.g. "http://proxy:8080") */
  proxy?: string;
  /** Base timeout in ms for actions (default: 30_000) */
  timeout?: number;
  /** Navigation timeout in ms (default: 60_000) */
  navigationTimeout?: number;
  /** Whether to ignore HTTPS errors (default: false) */
  ignoreHttpsErrors?: boolean;
  /** User agent override */
  userAgent?: string;
  /** Logging verbosity */
  logLevel?: LogLevel;
  /** Preferred screenshot quality preset */
  qualityPreset?: QualityPreset;
  /** Whether to persist browser state (cookies/localStorage) between sessions */
  persistSession?: boolean;
  /** Optional session ID to use or restore */
  sessionId?: string;
}

/** Default configuration values */
export const DEFAULT_SESSION_CONFIG: Required<
  Omit<SessionConfig, "extraHeaders" | "proxy" | "userAgent" | "locale" | "timezone" | "persistSession" | "sessionId">
> & {
  extraHeaders: Record<string, string> | undefined;
  proxy: string | undefined;
  userAgent: string | undefined;
  locale: string | undefined;
  timezone: string | undefined;
  persistSession: boolean | undefined;
  sessionId: string | undefined;
} = {
  browserType: "chromium",
  headless: true,
  viewport: { width: 1280, height: 720 },
  locale: undefined,
  timezone: undefined,
  extraHeaders: undefined,
  proxy: undefined,
  timeout: 30_000,
  navigationTimeout: 60_000,
  ignoreHttpsErrors: false,
  userAgent: undefined,
  logLevel: "info",
  qualityPreset: "medium",
  persistSession: undefined,
  sessionId: undefined,
};

/** Action types the engine supports */
export type ActionType =
  | "navigate"
  | "click"
  | "type"
  | "select"
  | "hover"
  | "dragAndDrop"
  | "scroll"
  | "scrollIntoView"
  | "screenshot"
  | "extractText"
  | "extractHtml"
  | "extractAttribute"
  | "waitForSelector"
  | "waitForNavigation"
  | "waitForTimeout"
  | "waitForHuman"
  | "evaluate"
  | "pressKey"
  | "check"
  | "uncheck"
  | "focus"
  | "fileChooser"
  | "reload"
  | "goBack"
  | "goForward"
  | "close"
  | "mouseClick"
  | "mouseMove"
  | "keyboardType";

/**
 * Parameters for each supported action.
 * Using a discriminated union so each action type carries its own params.
 */
export type ActionParams = NavigateParams
  | ClickParams
  | TypeParams
  | SelectParams
  | HoverParams
  | DragAndDropParams
  | ScrollParams
  | ScrollIntoViewParams
  | ScreenshotParams
  | ExtractTextParams
  | ExtractHtmlParams
  | ExtractAttributeParams
  | WaitForSelectorParams
  | WaitForNavigationParams
  | WaitForTimeoutParams
  | WaitForHumanParams
  | EvaluateParams
  | PressKeyParams
  | CheckParams
  | UncheckParams
  | FocusParams
  | FileChooserParams
  | ReloadParams
  | GoBackParams
  | GoForwardParams
  | CloseParams
  | MouseClickParams
  | MouseMoveParams
  | KeyboardTypeParams;

/** Error severity for error handling */
export type ErrorSeverity = "recoverable" | "fatal" | "transient";

/** Structured action result */
export interface ActionResult {
  success: boolean;
  /** Human-readable description */
  message: string;
  /** Optional data returned (e.g. extracted text, screenshot base64) */
  data?: unknown;
  /** Duration in ms */
  durationMs: number;
  /** Error details if failed */
  error?: ActionError;
}

/** Structured action error */
export interface ActionError {
  code: string;
  message: string;
  severity: ErrorSeverity;
  retryable: boolean;
  stack?: string;
}

/** A queued action in a workflow */
export interface QueuedAction {
  id: string;
  type: ActionType;
  params: ActionParams;
  description?: string;
  retryCount?: number;
  maxRetries?: number;
}

/** Workflow definition */
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  actions: QueuedAction[];
  sessionConfig?: SessionConfig;
}

/** Workflow execution status */
export type ExecutionStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

/** Workflow execution state */
export interface ExecutionState {
  workflowId: string;
  sessionId: string;
  status: ExecutionStatus;
  currentActionIndex: number;
  actions: QueuedAction[];
  results: ActionResult[];
  startedAt: string;
  completedAt?: string;
  error?: ActionError;
}

/** Session status info exposed via API */
export interface SessionInfo {
  id: string;
  browserType: BrowserType;
  createdAt: string;
  lastActiveAt: string;
  status: "idle" | "busy" | "closed" | "error";
  viewport: { width: number; height: number };
  currentUrl?: string;
  pageCount: number;
  actionCount: number;
  errorCount: number;
}

/** --- Individual action parameter types --- */

export interface NavigateParams {
  url: string;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
}

export interface ClickParams {
  selector: string;
  /** Force click even if element is not visible */
  force?: boolean;
  /** Modifier keys */
  modifiers?: ("Alt" | "Control" | "Meta" | "Shift")[];
  /** Position offset within the element */
  position?: { x: number; y: number };
  /** Click count (default: 1) */
  clickCount?: number;
  /** Delay between mousedown and mouseup (ms) */
  delay?: number;
  /** Use right/middle instead of left button */
  button?: "left" | "right" | "middle";
}

export interface TypeParams {
  selector: string;
  value: string;
  /** Clear existing value first */
  clearFirst?: boolean;
  /** Delay between keypresses (ms) */
  delay?: number;
}

export interface SelectParams {
  selector: string;
  value: string | string[];
}

export interface HoverParams {
  selector: string;
  /** Position offset within the element */
  position?: { x: number; y: number };
  /** Modifier keys */
  modifiers?: ("Alt" | "Control" | "Meta" | "Shift")[];
  /** Force hover even if element is not visible */
  force?: boolean;
}

export interface DragAndDropParams {
  sourceSelector: string;
  targetSelector: string;
  /** Offset within source element */
  sourcePosition?: { x: number; y: number };
  /** Offset within target element */
  targetPosition?: { x: number; y: number };
  /** Whether to force the action (bypass actionability checks) */
  force?: boolean;
}

export interface ScrollParams {
  /** Pixels to scroll horizontally (negative = left) */
  deltaX?: number;
  /** Pixels to scroll vertically (negative = up) */
  deltaY?: number;
  /** Selector of element to scroll (default: page-level) */
  selector?: string;
}

export interface ScrollIntoViewParams {
  selector: string;
  /** Scroll behavior */
  behavior?: "auto" | "smooth" | "instant";
  /** Block alignment */
  block?: "start" | "center" | "end" | "nearest";
  /** Inline alignment */
  inline?: "start" | "center" | "end" | "nearest";
}

export interface ScreenshotParams {
  /** Selector to capture (optional, full page otherwise) */
  selector?: string;
  /** Whether to capture full-page screenshot */
  fullPage?: boolean;
  /** Quality preset override */
  quality?: QualityPreset;
  /** Return as base64 (default: true) */
  asBase64?: boolean;
}

export interface ExtractTextParams {
  selector: string;
  /** Trim whitespace from result */
  trim?: boolean;
  /** Join multiple matches with this separator */
  join?: string;
  /** If true, returns first match only */
  first?: boolean;
}

export interface ExtractHtmlParams {
  selector: string;
  /** Get outer HTML (default) or inner HTML */
  outer?: boolean;
  /** If true, returns first match only */
  first?: boolean;
}

export interface ExtractAttributeParams {
  selector: string;
  attribute: string;
  /** If true, returns first match only */
  first?: boolean;
}

export interface WaitForSelectorParams {
  selector: string;
  /** Wait for element to be visible (default), attached, or hidden */
  state?: "attached" | "detached" | "visible" | "hidden";
  /** Override timeout in ms */
  timeout?: number;
}

export interface WaitForNavigationParams {
  /** URL pattern to wait for (string, regex, or function) */
  url?: string | RegExp;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  /** Timeout in ms */
  timeout?: number;
}

export interface WaitForTimeoutParams {
  /** Milliseconds to wait */
  ms: number;
}

export interface WaitForHumanParams {
  /** Optional message to show to the user explaining what they need to do */
  message?: string;
  /** Optional timeout in ms — if the human doesn't respond in time, the action fails */
  timeout?: number;
}

export interface EvaluateParams {
  /** JavaScript code to execute in the page context */
  expression: string;
  /** Optional argument to pass to the function */
  arg?: unknown;
}

export interface PressKeyParams {
  /** Key(s) to press. Can be a single key like "Enter" or a chord like "Control+A" */
  key: string;
  /** Delay between keydown and keyup (ms) */
  delay?: number;
}

export interface CheckParams {
  selector: string;
  /** Force check even if element is hidden */
  force?: boolean;
}

export interface UncheckParams {
  selector: string;
  /** Force uncheck even if element is hidden */
  force?: boolean;
}

export interface FocusParams {
  selector: string;
}

export interface FileChooserParams {
  selector: string;
  /** File path(s) to select */
  files: string[];
}

export interface ReloadParams {
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
}

export interface GoBackParams {
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
}

export interface GoForwardParams {
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
}

export interface CloseParams {
  /** No parameters needed */
}

export interface MouseClickParams {
  /** X coordinate on the page */
  x: number;
  /** Y coordinate on the page */
  y: number;
  /** Mouse button to click (default: "left") */
  button?: "left" | "right" | "middle";
  /** Click count (default: 1) */
  clickCount?: number;
  /** Delay between mousedown and mouseup in ms */
  delay?: number;
}

export interface MouseMoveParams {
  /** X coordinate on the page */
  x: number;
  /** Y coordinate on the page */
  y: number;
  /** Number of steps to move in (smooth movement) */
  steps?: number;
}

export interface KeyboardTypeParams {
  /** Text to type */
  text: string;
  /** Delay between key presses in ms */
  delay?: number;
}