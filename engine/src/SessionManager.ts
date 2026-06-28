/**
 * Session Manager — manages multiple concurrent browser sessions.
 *
 * Responsibilities:
 *  - Create and track browser sessions (launch, context, page)
 *  - Enforce session limits
 *  - Provide clean teardown and cleanup
 *  - Persist and restore storage state (cookies/localStorage) across sessions
 *  - Expose session info for API consumption
 */

import { chromium, firefox, webkit } from "playwright";
import type { Browser, BrowserContext } from "playwright";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { BrowserAutomation } from "./BrowserAutomation.js";
import { ScreenshotStream } from "./ScreenshotStream.js";
import {
  ActionFailedError,
  ErrorCodes,
  type ActionError,
} from "./errors.js";
import type {
  BrowserType,
  SessionConfig,
  SessionInfo,
} from "./types.js";
import { DEFAULT_SESSION_CONFIG } from "./types.js";

/** Maximum concurrent sessions allowed */
const DEFAULT_MAX_SESSIONS = 10;

/** How often to run cleanup of stale sessions (ms) */
const CLEANUP_INTERVAL_MS = 60_000;

/** Session inactivity timeout (ms) — close if idle for this long */
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/** Directory for persisted storage state files */
const STORAGE_DIR = "/home/team/shared/sessions";

/** Internal session record */
interface InternalSession {
  id: string;
  config: SessionConfig;
  browser: Browser;
  context: BrowserContext;
  automation: BrowserAutomation;
  stream: ScreenshotStream | null;
  createdAt: number;
  lastActiveAt: number;
  status: "idle" | "busy" | "closed" | "error";
  error: ActionError | null;
  persisted: boolean;
}

/** Generate a short, URL-safe session ID */
function generateSessionId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/** Callback types for session lifecycle persistence */
export interface SessionLifecycleCallbacks {
  onSessionCreated?: (sessionId: string, browserType: string, config: SessionConfig) => void;
  onSessionClosed?: (sessionId: string, status: string, actionCount: number, errorCount: number, error: ActionError | null) => void;
}

/**
 * SessionManager manages the lifecycle of browser sessions.
 * It supports creating, using, and tearing down concurrent browser sessions,
 * as well as persisting and restoring browser state (cookies/localStorage).
 */
export class SessionManager {
  private sessions: Map<string, InternalSession> = new Map();
  private maxSessions: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private logger: (level: string, msg: string, data?: unknown) => void;
  private callbacks: SessionLifecycleCallbacks;

  constructor(maxSessions = DEFAULT_MAX_SESSIONS, callbacks: SessionLifecycleCallbacks = {}) {
    this.maxSessions = maxSessions;
    this.callbacks = callbacks;
    this.logger = (level, msg, data) => {
      if (data) {
        console.log(`[SessionManager] [${level.toUpperCase()}] ${msg}`, data);
      } else {
        console.log(`[SessionManager] [${level.toUpperCase()}] ${msg}`);
      }
    };
    this.startCleanup();
    // Ensure storage directory exists
    fs.mkdir(STORAGE_DIR, { recursive: true }).catch(() => {});
  }

  // ── Session Management ──────────────────────────────────

  /**
   * Create a new browser session.
   * If config.persistSession is true, will try to load saved storage state
   * from /home/team/shared/sessions/[sessionId].json.
   *
   * @param config - Optional session configuration overrides
   * @returns The session ID
   * @throws ActionFailedError if session limit is reached or launch fails
   */
  async createSession(config?: Partial<SessionConfig>): Promise<string> {
    const mergedConfig: SessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      ...config,
    };

    // If a session ID is provided and it already exists, return it
    if (mergedConfig.sessionId && this.sessions.has(mergedConfig.sessionId)) {
      const existing = this.sessions.get(mergedConfig.sessionId)!;
      if (existing.status !== "closed" && !existing.automation.isClosed) {
        this.logger("info", "Reusing existing session", { sessionId: mergedConfig.sessionId });
        existing.lastActiveAt = Date.now();
        return mergedConfig.sessionId;
      }
    }

    // Enforce session limit
    if (this.sessions.size >= this.maxSessions) {
      throw new ActionFailedError(
        ErrorCodes.SESSION_LIMIT_REACHED,
        `Maximum of ${this.maxSessions} concurrent sessions reached. Close an existing session first.`,
        "fatal",
        false,
      );
    }

    const launchOptions: Record<string, unknown> = {
      headless: mergedConfig.headless,
      timeout: mergedConfig.navigationTimeout ?? 60_000,
    };

    if (mergedConfig.proxy) {
      launchOptions.proxy = { server: mergedConfig.proxy };
    }

    if (mergedConfig.ignoreHttpsErrors) {
      launchOptions.ignoreHTTPSErrors = true;
    }

    const pwType = mergedConfig.browserType ?? "chromium";
    const launchBrowser = this.getBrowserLauncher(pwType);

    this.logger("info", "Launching browser session", {
      browserType: pwType,
      headless: mergedConfig.headless,
      persistSession: mergedConfig.persistSession,
    });

    let browser: Browser;
    try {
      browser = await launchBrowser(launchOptions);
    } catch (err) {
      this.logger("error", "Failed to launch browser", { error: String(err) });
      throw new ActionFailedError(
        ErrorCodes.BROWSER_LAUNCH_FAILED,
        `Failed to launch ${pwType} browser: ${err instanceof Error ? err.message : String(err)}`,
        "fatal",
        false,
      );
    }

    const contextOptions: Record<string, unknown> = {
      // Default viewport
      viewport: mergedConfig.viewport ?? { width: 1280, height: 720 },
    };

    if (mergedConfig.locale) {
      contextOptions.locale = mergedConfig.locale;
    }

    if (mergedConfig.timezone) {
      contextOptions.timezone = mergedConfig.timezone;
    }

    if (mergedConfig.extraHeaders) {
      contextOptions.extraHeaders = mergedConfig.extraHeaders;
    }

    if (mergedConfig.userAgent) {
      contextOptions.userAgent = mergedConfig.userAgent;
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    const sessionId = mergedConfig.sessionId ?? generateSessionId();

    // ── Restore storage state if persistence is requested ──
    let persisted = false;
    if (mergedConfig.persistSession) {
      const storagePath = path.join(STORAGE_DIR, `${sessionId}.json`);
      try {
        const data = await fs.readFile(storagePath, "utf-8");
        const storageState = JSON.parse(data) as {
          cookies?: Array<Record<string, unknown>>;
          origins?: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
        };

        // Restore cookies
        if (storageState.cookies && storageState.cookies.length > 0) {
          await context.addCookies(
            storageState.cookies.map((c: Record<string, unknown>) => ({
              name: String(c.name),
              value: String(c.value),
              domain: String(c.domain),
              path: String(c.path ?? "/"),
              httpOnly: Boolean(c.httpOnly),
              secure: Boolean(c.secure),
              sameSite: (c.sameSite as "Strict" | "Lax" | "None") ?? "Lax",
            })),
          );
        }

        // Restore localStorage via evaluate on the origin
        if (storageState.origins) {
          for (const origin of storageState.origins) {
            try {
              await page.goto(origin.origin, { waitUntil: "domcontentloaded", timeout: 15_000 });
              for (const item of origin.localStorage) {
                await page.evaluate(
                  ({ name, value }: { name: string; value: string }) => {
                    localStorage.setItem(name, value);
                  },
                  { name: item.name, value: item.value },
                );
              }
            } catch {
              // Silently skip origins that fail to load
            }
          }
        }

        persisted = true;
        this.logger("info", "Restored storage state", { sessionId, storagePath });
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          this.logger("warn", "Failed to restore storage state", {
            sessionId,
            error: String(err),
          });
        }
      }
    }

    const automation = new BrowserAutomation(sessionId, page, context, mergedConfig);
    const stream = new ScreenshotStream(sessionId, automation);

    const record: InternalSession = {
      id: sessionId,
      config: mergedConfig,
      browser,
      context,
      automation,
      stream,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      status: "idle",
      error: null,
      persisted,
    };

    this.sessions.set(sessionId, record);
    this.logger("info", "Session created", { sessionId, browserType: pwType, persisted });

    // Fire lifecycle callback
    if (this.callbacks.onSessionCreated) {
      try {
        this.callbacks.onSessionCreated(sessionId, pwType, mergedConfig);
      } catch (err) {
        this.logger("warn", "onSessionCreated callback failed", { sessionId, error: String(err) });
      }
    }

    return sessionId;
  }

  /**
   * Save the current storage state (cookies/localStorage) to disk.
   * @param sessionId - The session ID
   */
  async saveStorageState(sessionId: string): Promise<string | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.automation.isClosed) return null;

    try {
      const ctx = session.automation.getPlaywrightContext();
      const state = await ctx.storageState();
      const storagePath = path.join(STORAGE_DIR, `${sessionId}.json`);
      await fs.writeFile(storagePath, JSON.stringify(state, null, 2), "utf-8");
      this.logger("info", "Saved storage state", { sessionId, storagePath });
      return storagePath;
    } catch (err) {
      this.logger("error", "Failed to save storage state", { sessionId, error: String(err) });
      throw new ActionFailedError(
        ErrorCodes.STORAGE_STATE_FAILED,
        `Failed to save storage state: ${err instanceof Error ? err.message : String(err)}`,
        "recoverable",
        true,
      );
    }
  }

  /**
   * Resume a human-wait action on a session.
   * @param sessionId - The session ID
   * @param waitId - The wait ID from the waitForHuman action result
   * @param data - Optional data to pass back
   * @returns true if resolved, false if no matching wait
   */
  resumeHumanWait(sessionId: string, waitId: string, data?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.automation.isClosed) return false;
    return session.automation.resumeHumanWait(waitId, data);
  }

  /**
   * Get an automation instance by session ID.
   */
  getAutomation(sessionId: string): BrowserAutomation {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new ActionFailedError(
        ErrorCodes.SESSION_NOT_FOUND,
        `Session "${sessionId}" not found`,
        "fatal",
        false,
      );
    }
    if (session.status === "closed" || session.automation.isClosed) {
      throw new ActionFailedError(
        ErrorCodes.SESSION_NOT_FOUND,
        `Session "${sessionId}" is closed`,
        "fatal",
        false,
      );
    }
    session.lastActiveAt = Date.now();
    return session.automation;
  }

  /**
   * Get the screenshot stream for a session.
   */
  getStream(sessionId: string): ScreenshotStream {
    const session = this.sessions.get(sessionId);
    if (!session || !session.stream) {
      throw new ActionFailedError(
        ErrorCodes.SESSION_NOT_FOUND,
        `Session "${sessionId}" not found or stream unavailable`,
        "fatal",
        false,
      );
    }
    session.lastActiveAt = Date.now();
    return session.stream;
  }

  /**
   * Close and clean up a session. Optionally saves storage state before closing.
   */
  async closeSession(sessionId: string, saveState = false): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.logger("info", "Closing session", { sessionId, saveState });

    // Save storage state before closing if requested
    if (saveState || session.persisted) {
      try {
        await this.saveStorageState(sessionId);
      } catch {
        // Best-effort
      }
    }

    try {
      // Stop streaming
      if (session.stream) {
        session.stream.stop();
      }
      // Close automation
      await session.automation.close();
    } catch (err) {
      this.logger("error", "Error closing session", { sessionId, error: String(err) });
    } finally {
      try {
        await session.browser.close();
      } catch {
        // Best-effort
      }
      session.status = "closed";
      const stats = session.automation.stats;

      // Fire lifecycle callback
      if (this.callbacks.onSessionClosed) {
        try {
          this.callbacks.onSessionClosed(sessionId, "closed", stats.actionCount, stats.errorCount, session.error);
        } catch (err) {
          this.logger("warn", "onSessionClosed callback failed", { sessionId, error: String(err) });
        }
      }

      this.sessions.delete(sessionId);
    }
  }

  /**
   * Close all sessions (cleanup on shutdown).
   */
  async closeAllSessions(forceSave = false): Promise<void> {
    this.logger("info", "Closing all sessions", { count: this.sessions.size });
    const ids = Array.from(this.sessions.keys());
    await Promise.allSettled(ids.map((id) => this.closeSession(id, forceSave)));
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Get info about all active sessions.
   */
  listSessions(): SessionInfo[] {
    const result: SessionInfo[] = [];
    for (const session of this.sessions.values()) {
      result.push(this.toSessionInfo(session));
    }
    return result;
  }

  /**
   * Get info about a single session.
   */
  getSessionInfo(sessionId: string): SessionInfo | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return this.toSessionInfo(session);
  }

  /**
   * Set session status to busy/idle.
   */
  setSessionStatus(sessionId: string, status: "idle" | "busy"): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.lastActiveAt = Date.now();
    }
  }

  /** Number of active sessions */
  get activeCount(): number {
    return this.sessions.size;
  }

  /** Maximum sessions allowed */
  get maxSessionLimit(): number {
    return this.maxSessions;
  }

  // ── Private ──────────────────────────────────────────────

  private getBrowserLauncher(type: BrowserType) {
    switch (type) {
      case "firefox":
        return firefox.launch.bind(firefox);
      case "webkit":
        return webkit.launch.bind(webkit);
      case "chromium":
      default:
        return chromium.launch.bind(chromium);
    }
  }

  private toSessionInfo(session: InternalSession): SessionInfo {
    const stats = session.automation.stats;
    return {
      id: session.id,
      browserType: session.config.browserType ?? "chromium",
      createdAt: new Date(session.createdAt).toISOString(),
      lastActiveAt: new Date(session.lastActiveAt).toISOString(),
      status: session.automation.isClosed ? "closed" : session.status,
      viewport: session.config.viewport ?? { width: 1280, height: 720 },
      currentUrl: session.automation.currentUrl,
      pageCount: 1,
      actionCount: stats.actionCount,
      errorCount: stats.errorCount,
    };
  }

  /** Periodic cleanup of stale sessions */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions.entries()) {
        if (session.status === "closed" || session.automation.isClosed) {
          this.logger("info", "Cleaning up closed session", { sessionId: id });
          // Save state before cleanup if persisted
          if (session.persisted) {
            this.saveStorageState(id).catch(() => {});
          }
          this.sessions.delete(id);
          continue;
        }
        if (now - session.lastActiveAt > INACTIVITY_TIMEOUT_MS) {
          this.logger("info", "Closing inactive session", { sessionId: id, idleMs: now - session.lastActiveAt });
          this.closeSession(id).catch(() => {});
        }
      }
    }, CLEANUP_INTERVAL_MS);
  }
}