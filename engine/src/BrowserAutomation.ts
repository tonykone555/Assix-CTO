/**
 * Core browser automation module.
 * Manages a single Page within a BrowserContext and executes actions
 * with robust error handling, retry logic, and structured results.
 */

import type { Page, BrowserContext, FrameLocator, Locator } from "playwright";
import type {
  ActionParams,
  ActionResult,
  ActionType,
  BrowserType,
  SessionConfig,
  QualityPreset,
} from "./types.js";
import {
  ActionFailedError,
  ErrorCodes,
  classifyPlaywrightError,
  formatError,
  toActionError,
  withRetry,
} from "./errors.js";

/** Times in ms for different quality presets (lower = faster, lower quality) */
const QUALITY_TO_JPEG_LEVEL: Record<QualityPreset, number> = {
  low: 30,
  medium: 50,
  high: 80,
  ultra: 95,
};

/** Scale factor per quality preset (1 = full res) */
const QUALITY_TO_SCALE: Record<QualityPreset, number> = {
  low: 0.3,
  medium: 0.5,
  high: 0.8,
  ultra: 1.0,
};

/** Max interval between screenshots during streaming (ms) */
const SCREENSHOT_INTERVALS = {
  low: 500,
  medium: 250,
  high: 100,
  ultra: 50,
};

/**
 * BrowserAutomation wraps a Playwright Page to provide:
 *  - All supported action types with robust error classification
 *  - Automatic retry for recoverable errors
 *  - Structured ActionResult for every operation
 *  - Screenshot streaming support with adaptive quality
 */
export class BrowserAutomation {
  public readonly id: string;
  private page: Page;
  private context: BrowserContext;
  private config: SessionConfig;
  private actionCount = 0;
  private errorCount = 0;
  private lastScreenshotBase64: string | null = null;
  private lastScreenshotBuffer: Buffer | null = null;
  private closed = false;
  private logger: (level: string, msg: string, data?: unknown) => void;

  /** Human-wait resolvers: keyed by a unique ID per wait call */
  private humanWaitResolvers: Map<string, { resolve: (value: string) => void; reject: (err: Error) => void; timer?: ReturnType<typeof setTimeout> }> = new Map();

  constructor(
    id: string,
    page: Page,
    context: BrowserContext,
    config: SessionConfig,
  ) {
    this.id = id;
    this.page = page;
    this.context = context;
    this.config = config;
    this.logger = this.createLogger(config.logLevel ?? "info");
  }

  // ── Getters ──────────────────────────────────────────────

  get currentUrl(): string {
    return this.page.url();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get stats(): { actionCount: number; errorCount: number } {
    return { actionCount: this.actionCount, errorCount: this.errorCount };
  }

  // ── Public API ───────────────────────────────────────────

  /**
   * Execute a single action on the current page.
   */
  async executeAction(
    type: ActionType,
    params: ActionParams,
    retryable = true,
  ): Promise<ActionResult> {
    const start = performance.now();

    try {
      this.actionCount++;
      const result = await this.runAction(type, params, retryable);
      result.durationMs = performance.now() - start;
      this.logger("info", `Action ${type} completed`, {
        durationMs: result.durationMs,
      });
      return result;
    } catch (err) {
      this.errorCount++;
      const actionError = classifyPlaywrightError(err);
      const durationMs = performance.now() - start;
      this.logger("error", `Action ${type} failed: ${formatError(actionError)}`);
      return {
        success: false,
        message: actionError.message,
        durationMs,
        error: actionError,
      };
    }
  }

  /**
   * Take a screenshot and compute a delta from the previous one.
   * Returns { base64, delta } where delta is a minimal base64 diff
   * if the screenshot hasn't changed much (simple heuristic: identical
   * base64 prefix check).
   */
  async captureScreenshot(
    quality?: QualityPreset,
  ): Promise<{ base64: string; delta: boolean; quality: QualityPreset; timestamp: number }> {
    const preset = quality ?? this.config.qualityPreset ?? "medium";
    const scale = QUALITY_TO_SCALE[preset];
    const jpegLevel = QUALITY_TO_JPEG_LEVEL[preset];

    try {
      const buffer = await this.page.screenshot({
        type: "jpeg",
        quality: jpegLevel,
        scale: "css" as any, // apply device pixel ratio scaling
        fullPage: false,
      });

      const base64 = buffer.toString("base64");
      const previousBuffer = this.lastScreenshotBuffer;

      // Simple delta detection: compare buffers
      let delta = false;
      if (previousBuffer && previousBuffer.equals(buffer)) {
        delta = true; // exact match, no change
      }

      this.lastScreenshotBuffer = buffer;
      this.lastScreenshotBase64 = base64;

      return {
        base64,
        delta,
        quality: preset,
        timestamp: Date.now(),
      };
    } catch (err) {
      const actionError = classifyPlaywrightError(err);
      this.logger("error", `Screenshot failed: ${formatError(actionError)}`);
      throw err;
    }
  }

  /** Get the recommended screenshot interval for the current quality preset */
  getScreenshotInterval(): number {
    const preset = this.config.qualityPreset ?? "medium";
    return SCREENSHOT_INTERVALS[preset];
  }

  /** Close the page and context */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    // Reject any pending human waits
    for (const [, entry] of this.humanWaitResolvers) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.reject(new Error("Session closed while waiting for human input"));
    }
    this.humanWaitResolvers.clear();
    try {
      await this.page.close();
      await this.context.close();
    } catch {
      // Best-effort cleanup
    }
  }

  /**
   * Signal a human-wait to resume. Looks up the pending wait by waitId
   * and resolves it with the provided data.
   * @param waitId - The wait ID from the action result
   * @param data - Optional data from the human to pass back
   * @returns true if a pending wait was resolved, false if no matching wait
   */
  resumeHumanWait(waitId: string, data?: string): boolean {
    const entry = this.humanWaitResolvers.get(waitId);
    if (!entry) return false;
    if (entry.timer) clearTimeout(entry.timer);
    this.humanWaitResolvers.delete(waitId);
    entry.resolve(data ?? "resumed");
    return true;
  }

  /** Check if there is a pending human wait */
  get hasPendingHumanWait(): boolean {
    return this.humanWaitResolvers.size > 0;
  }

  /** Get the context (for storage state) */
  getPlaywrightContext(): BrowserContext {
    return this.context;
  }

  // ── Private helpers ──────────────────────────────────────

  private async runAction(
    type: ActionType,
    params: ActionParams,
    retryable: boolean,
  ): Promise<ActionResult> {
    let data: unknown = undefined;

    const exec = async () => {
      switch (type) {
        case "navigate":
          return this.actionNavigate(params);
        case "click":
          return this.actionClick(params);
        case "type":
          return this.actionType(params);
        case "select":
          return this.actionSelect(params);
        case "hover":
          return this.actionHover(params);
        case "dragAndDrop":
          return this.actionDragAndDrop(params);
        case "scroll":
          return this.actionScroll(params);
        case "scrollIntoView":
          return this.actionScrollIntoView(params);
        case "screenshot":
          return this.actionScreenshot(params);
        case "extractText":
          return this.actionExtractText(params, data);
        case "extractHtml":
          return this.actionExtractHtml(params, data);
        case "extractAttribute":
          return this.actionExtractAttribute(params, data);
        case "waitForSelector":
          return this.actionWaitForSelector(params);
        case "waitForNavigation":
          return this.actionWaitForNavigation(params);
        case "waitForTimeout":
          return this.actionWaitForTimeout(params);
        case "waitForHuman":
          return this.actionWaitForHuman(params);
        case "evaluate":
          return this.actionEvaluate(params, data);
        case "pressKey":
          return this.actionPressKey(params);
        case "check":
          return this.actionCheck(params);
        case "uncheck":
          return this.actionUncheck(params);
        case "focus":
          return this.actionFocus(params);
        case "fileChooser":
          return this.actionFileChooser(params);
        case "reload":
          return this.actionReload(params);
        case "goBack":
          return this.actionGoBack(params);
        case "goForward":
          return this.actionGoForward(params);
        case "close":
          return this.actionClose();
        case "mouseClick":
          return this.actionMouseClick(params);
        case "mouseMove":
          return this.actionMouseMove(params);
        case "keyboardType":
          return this.actionKeyboardType(params);
        default:
          throw new ActionFailedError(
            ErrorCodes.UNSUPPORTED_ACTION,
            `Unsupported action type: ${type}`,
            "fatal",
            false,
          );
      }
    };

    if (retryable) {
      // Use retry wrapper for navigations and other flaky operations
      if (["navigate", "click", "waitForSelector", "waitForNavigation"].includes(type)) {
        return await withRetry(exec, {
          context: `action ${type}`,
          maxRetries: 2,
          onRetry: (attempt, error, delay) => {
            this.logger("warn", `Retry ${attempt} for ${type} in ${delay}ms`, { error });
          },
        });
      }
    }

    return await exec();
  }

  // ── Individual action implementations ────────────────────

  private async actionNavigate(params: any): Promise<ActionResult> {
    const { url, waitUntil = "domcontentloaded" } = params;
    await this.page.goto(url, { waitUntil, timeout: this.config.navigationTimeout });
    return { success: true, message: `Navigated to ${url}`, durationMs: 0 };
  }

  private async actionClick(params: any): Promise<ActionResult> {
    const { selector, force, modifiers, position, clickCount, delay, button } = params;
    await this.page.click(selector, {
      force,
      modifiers,
      position,
      clickCount,
      delay,
      button,
      timeout: this.config.timeout,
    });
    return { success: true, message: `Clicked "${selector}"`, durationMs: 0 };
  }

  private async actionType(params: any): Promise<ActionResult> {
    const { selector, value, clearFirst, delay } = params;
    if (clearFirst) {
      await this.page.fill(selector, "", { timeout: this.config.timeout });
    }
    if (clearFirst) {
      await this.page.type(selector, value, { delay });
    } else {
      await this.page.fill(selector, value, { timeout: this.config.timeout });
    }
    return { success: true, message: `Typed into "${selector}"`, durationMs: 0 };
  }

  private async actionSelect(params: any): Promise<ActionResult> {
    const { selector, value } = params;
    await this.page.selectOption(selector, value, { timeout: this.config.timeout });
    return { success: true, message: `Selected option in "${selector}"`, durationMs: 0 };
  }

  private async actionHover(params: any): Promise<ActionResult> {
    const { selector, position, modifiers, force } = params;
    await this.page.hover(selector, {
      position,
      modifiers,
      force,
      timeout: this.config.timeout,
    });
    return { success: true, message: `Hovered over "${selector}"`, durationMs: 0 };
  }

  private async actionDragAndDrop(params: any): Promise<ActionResult> {
    const { sourceSelector, targetSelector, sourcePosition, targetPosition, force } = params;
    const source = this.page.locator(sourceSelector);
    const target = this.page.locator(targetSelector);

    if (force) {
      // Bypass actionability checks
      const sourceBox = await source.boundingBox();
      const targetBox = await target.boundingBox();
      if (!sourceBox || !targetBox) {
        throw new ActionFailedError(
          ErrorCodes.SELECTOR_NOT_FOUND,
          "Could not find source or target element bounding box",
          "fatal",
          false,
        );
      }

      const sx = sourcePosition?.x ?? sourceBox.width / 2;
      const sy = sourcePosition?.y ?? sourceBox.height / 2;
      const tx = targetPosition?.x ?? targetBox.width / 2;
      const ty = targetPosition?.y ?? targetBox.height / 2;

      await this.page.mouse.move(sourceBox.x + sx, sourceBox.y + sy);
      await this.page.mouse.down();
      await this.page.mouse.move(targetBox.x + tx, targetBox.y + ty, { steps: 10 });
      await this.page.mouse.up();
    } else {
      await source.dragTo(target, {
        sourcePosition,
        targetPosition,
        timeout: this.config.timeout,
      });
    }

    return {
      success: true,
      message: `Dragged "${sourceSelector}" to "${targetSelector}"`,
      durationMs: 0,
    };
  }

  private async actionScroll(params: any): Promise<ActionResult> {
    const { deltaX = 0, deltaY = 0, selector } = params;
    if (selector) {
      const locator = this.page.locator(selector);
      await locator.evaluate((el, { dx, dy }: { dx: number; dy: number }) => {
        el.scrollBy(dx, dy);
      }, { dx: deltaX, dy: deltaY });
    } else {
      await this.page.evaluate(({ dx, dy }: { dx: number; dy: number }) => {
        window.scrollBy(dx, dy);
      }, { dx: deltaX, dy: deltaY });
    }
    return {
      success: true,
      message: `Scrolled by (${deltaX}, ${deltaY})${selector ? ` on "${selector}"` : ""}`,
      durationMs: 0,
    };
  }

  private async actionScrollIntoView(params: any): Promise<ActionResult> {
    const { selector, behavior = "auto", block = "center", inline = "center" } = params;
    const locator = this.page.locator(selector);
    await locator.scrollIntoViewIfNeeded({ timeout: this.config.timeout });
    // Additionally, use smooth scroll for better alignment
    await locator.evaluate(
      (el, { b, i }: { b: string; i: string }) => {
        el.scrollIntoView({ behavior: "smooth" as ScrollBehavior, block: b as ScrollLogicalPosition, inline: i as ScrollLogicalPosition });
      },
      { b: block, i: inline },
    ).catch(() => { /* non-critical, best-effort */ });
    return {
      success: true,
      message: `Scrolled "${selector}" into view`,
      durationMs: 0,
    };
  }

  private async actionScreenshot(params: any): Promise<ActionResult> {
    const { selector, fullPage = false, quality, asBase64 = true } = params;
    const preset: QualityPreset = quality ?? this.config.qualityPreset ?? "medium";
    const jpegLevel = QUALITY_TO_JPEG_LEVEL[preset];

    let buffer: Buffer;
    if (selector) {
      const locator = this.page.locator(selector);
      buffer = await locator.screenshot({
        type: "jpeg",
        quality: jpegLevel,
      });
    } else {
      buffer = await this.page.screenshot({
        type: "jpeg",
        quality: jpegLevel,
        fullPage,
        scale: "css" as any,
      });
    }

    const result = asBase64 ? buffer.toString("base64") : buffer;
    return {
      success: true,
      message: `Screenshot captured (${preset} quality)`,
      durationMs: 0,
      data: result,
    };
  }

  private async actionExtractText(params: any, data: unknown): Promise<ActionResult> {
    const { selector, trim = true, join, first = false } = params;
    const locator = this.page.locator(selector);
    let result: string | string[];
    if (first) {
      result = await locator.first().innerText({ timeout: this.config.timeout });
      if (trim) result = (result as string).trim();
    } else {
      result = await locator.allInnerTexts();
      if (trim) result = result.map((t: string) => t.trim());
      if (join) result = result.join(join);
    }
    return {
      success: true,
      message: `Extracted text from "${selector}"`,
      durationMs: 0,
      data: result,
    };
  }

  private async actionExtractHtml(params: any, data: unknown): Promise<ActionResult> {
    const { selector, outer = true, first = false } = params;
    const locator = this.page.locator(selector);
    let result: string | string[];
    if (first) {
      result = outer
        ? await locator.first().evaluate((el: Element) => el.outerHTML)
        : await locator.first().innerHTML();
    } else {
      const all = await locator.all();
      result = await Promise.all(
        all.map((el: Locator) =>
          outer
            ? el.evaluate((e: Element) => e.outerHTML)
            : el.innerHTML(),
        ),
      );
    }
    return {
      success: true,
      message: `Extracted HTML from "${selector}"`,
      durationMs: 0,
      data: result,
    };
  }

  private async actionExtractAttribute(params: any, data: unknown): Promise<ActionResult> {
    const { selector, attribute, first = false } = params;
    const locator = this.page.locator(selector);
    let result: string | (string | null)[];
    if (first) {
      result = (await locator.first().getAttribute(attribute, { timeout: this.config.timeout })) ?? "";
    } else {
      const all = await locator.all();
      result = await Promise.all(
        all.map((el: Locator) => el.getAttribute(attribute)),
      );
    }
    return {
      success: true,
      message: `Extracted attribute "${attribute}" from "${selector}"`,
      durationMs: 0,
      data: result,
    };
  }

  private async actionWaitForSelector(params: any): Promise<ActionResult> {
    const { selector, state = "visible", timeout } = params;
    await this.page.waitForSelector(selector, {
      state,
      timeout: timeout ?? this.config.timeout,
    });
    return {
      success: true,
      message: `Selector "${selector}" is now ${state}`,
      durationMs: 0,
    };
  }

  private async actionWaitForNavigation(params: any): Promise<ActionResult> {
    const { url, waitUntil = "domcontentloaded", timeout } = params;
    await this.page.waitForURL(url, {
      waitUntil,
      timeout: timeout ?? this.config.navigationTimeout,
    });
    return {
      success: true,
      message: `Navigation completed${url ? ` to ${url}` : ""}`,
      durationMs: 0,
    };
  }

  private async actionWaitForTimeout(params: any): Promise<ActionResult> {
    const { ms } = params;
    await this.page.waitForTimeout(ms);
    return { success: true, message: `Waited ${ms}ms`, durationMs: 0 };
  }

  private async actionWaitForHuman(params: any): Promise<ActionResult> {
    const { message = "Human intervention required", timeout = 300_000 } = params;
    const waitId = `${this.id}_human_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const result = await new Promise<string>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      if (timeout > 0) {
        timer = setTimeout(() => {
          this.humanWaitResolvers.delete(waitId);
          reject(new Error(`Human wait timed out after ${timeout}ms`));
        }, timeout);
      }

      this.humanWaitResolvers.set(waitId, { resolve, reject, timer });
    });

    return {
      success: true,
      message: `Human intervention completed: ${result}`,
      durationMs: 0,
      data: { waitId, result },
    };
  }

  private async actionEvaluate(params: any, data: unknown): Promise<ActionResult> {
    const { expression, arg } = params;
    const result = arg !== undefined
      ? await this.page.evaluate(expression, arg)
      : await this.page.evaluate(expression);
    return {
      success: true,
      message: "Evaluation completed",
      durationMs: 0,
      data: result,
    };
  }

  private async actionPressKey(params: any): Promise<ActionResult> {
    const { key, delay } = params;
    await this.page.keyboard.press(key, { delay });
    return { success: true, message: `Pressed key "${key}"`, durationMs: 0 };
  }

  private async actionCheck(params: any): Promise<ActionResult> {
    const { selector, force } = params;
    await this.page.check(selector, { force, timeout: this.config.timeout });
    return { success: true, message: `Checked "${selector}"`, durationMs: 0 };
  }

  private async actionUncheck(params: any): Promise<ActionResult> {
    const { selector, force } = params;
    await this.page.uncheck(selector, { force, timeout: this.config.timeout });
    return { success: true, message: `Unchecked "${selector}"`, durationMs: 0 };
  }

  private async actionFocus(params: any): Promise<ActionResult> {
    const { selector } = params;
    await this.page.focus(selector, { timeout: this.config.timeout });
    return { success: true, message: `Focused on "${selector}"`, durationMs: 0 };
  }

  private async actionFileChooser(params: any): Promise<ActionResult> {
    const { selector, files } = params;
    // Set up the file chooser handler before clicking
    const [fileChooser] = await Promise.all([
      this.page.waitForEvent("filechooser", { timeout: this.config.timeout }),
      this.page.click(selector, { timeout: this.config.timeout }),
    ]);
    await fileChooser.setFiles(files);
    return { success: true, message: `Uploaded file to "${selector}"`, durationMs: 0 };
  }

  private async actionReload(params: any): Promise<ActionResult> {
    const { waitUntil = "domcontentloaded" } = params;
    await this.page.reload({ waitUntil, timeout: this.config.navigationTimeout });
    return { success: true, message: "Page reloaded", durationMs: 0 };
  }

  private async actionGoBack(params: any): Promise<ActionResult> {
    const { waitUntil = "domcontentloaded" } = params;
    await this.page.goBack({ waitUntil, timeout: this.config.navigationTimeout });
    return { success: true, message: "Navigated back", durationMs: 0 };
  }

  private async actionGoForward(params: any): Promise<ActionResult> {
    const { waitUntil = "domcontentloaded" } = params;
    await this.page.goForward({ waitUntil, timeout: this.config.navigationTimeout });
    return { success: true, message: "Navigated forward", durationMs: 0 };
  }

  private async actionClose(): Promise<ActionResult> {
    await this.close();
    return { success: true, message: "Page closed", durationMs: 0 };
  }

  // ── Mouse & Keyboard Primitives (no selector needed) ──

  private async actionMouseClick(params: any): Promise<ActionResult> {
    const { x, y, button = "left", clickCount = 1, delay } = params;
    await this.page.mouse.click(x, y, { button, clickCount, delay });
    return { success: true, message: `Mouse clicked at (${x}, ${y})`, durationMs: 0 };
  }

  private async actionMouseMove(params: any): Promise<ActionResult> {
    const { x, y, steps } = params;
    await this.page.mouse.move(x, y, steps ? { steps } : undefined);
    return { success: true, message: `Mouse moved to (${x}, ${y})`, durationMs: 0 };
  }

  private async actionKeyboardType(params: any): Promise<ActionResult> {
    const { text, delay } = params;
    await this.page.keyboard.type(text, { delay });
    return { success: true, message: `Typed text (${text.length} chars)`, durationMs: 0 };
  }

  // ── Logging ──────────────────────────────────────────────

  private createLogger(logLevel: string) {
    const levels = ["silent", "error", "warn", "info", "debug"];
    const currentLevel = levels.indexOf(logLevel);
    return (level: string, msg: string, data?: unknown) => {
      const msgLevel = levels.indexOf(level);
      if (msgLevel > currentLevel || currentLevel < 0) return;
      const prefix = `[Assix:${this.id.slice(0, 8)}]`;
      if (data) {
        console.log(`${prefix} [${level.toUpperCase()}] ${msg}`, data);
      } else {
        console.log(`${prefix} [${level.toUpperCase()}] ${msg}`);
      }
    };
  }
}