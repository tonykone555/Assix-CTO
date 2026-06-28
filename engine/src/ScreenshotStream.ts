/**
 * Efficient screenshot streaming module.
 * Manages adaptive-quality screenshot capture, delta detection,
 * and frequency tuning based on connection quality.
 */

import type { QualityPreset } from "./types.js";
import type { BrowserAutomation } from "./BrowserAutomation.js";

/** Callback for each screenshot frame during streaming */
export type ScreenshotFrameCallback = (frame: ScreenshotFrame) => void;

/** A single frame in the screenshot stream */
export interface ScreenshotFrame {
  sessionId: string;
  base64: string;
  delta: boolean;
  quality: QualityPreset;
  timestamp: number;
  /** Frame number in the stream */
  frameNumber: number;
  /** Whether this is a full (non-delta) frame */
  isFullFrame: boolean;
}

/** Adaptive streaming configuration */
export interface StreamConfig {
  /** Initial quality preset */
  initialQuality?: QualityPreset;
  /** Minimum screenshot interval in ms (default: 50) */
  minInterval?: number;
  /** Maximum screenshot interval in ms (default: 2000) */
  maxInterval?: number;
  /** How many consecutive deltas before sending a full frame (default: 30) */
  fullFrameAfterDeltas?: number;
  /** How often to force a full frame regardless (ms, default: 10_000) */
  forcedFullFrameMs?: number;
}

/** Adaptive quality levels and their characteristics */
interface QualityProfile {
  interval: number;
  jpegLevel: number;
  scale: number;
}

const QUALITY_PROFILES: Record<QualityPreset, QualityProfile> = {
  low: { interval: 500, jpegLevel: 30, scale: 0.3 },
  medium: { interval: 250, jpegLevel: 50, scale: 0.5 },
  high: { interval: 100, jpegLevel: 80, scale: 0.8 },
  ultra: { interval: 50, jpegLevel: 95, scale: 1.0 },
};

/**
 * ScreenshotStream manages a real-time stream of screenshots from a
 * browser automation session, with adaptive quality controls.
 *
 * Features:
 *  - Adaptive quality: lowers quality when frames are stale or on slow connections
 *  - Delta detection: skips identical frames to save bandwidth
 *  - Periodic full frames: ensures the viewer stays in sync
 *  - Configurable frame rate per quality preset
 */
export class ScreenshotStream {
  private sessionId: string;
  private automation: BrowserAutomation;
  private config: Required<StreamConfig>;
  private active = false;
  private frameNumber = 0;
  private consecutiveDeltas = 0;
  private lastFullFrameTimestamp = 0;
  private currentQuality: QualityPreset;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private callback: ScreenshotFrameCallback | null = null;
  private lastFrameBase64: string | null = null;

  constructor(
    sessionId: string,
    automation: BrowserAutomation,
    config: StreamConfig = {},
  ) {
    this.sessionId = sessionId;
    this.automation = automation;
    this.currentQuality = config.initialQuality ?? "medium";

    this.config = {
      initialQuality: config.initialQuality ?? "medium",
      minInterval: config.minInterval ?? 50,
      maxInterval: config.maxInterval ?? 2000,
      fullFrameAfterDeltas: config.fullFrameAfterDeltas ?? 30,
      forcedFullFrameMs: config.forcedFullFrameMs ?? 10_000,
    };
  }

  /** Start the stream with a callback to receive frames */
  start(callback: ScreenshotFrameCallback): void {
    if (this.active) return;
    this.active = true;
    this.callback = callback;
    this.frameNumber = 0;
    this.consecutiveDeltas = 0;
    this.lastFullFrameTimestamp = Date.now();

    this.scheduleNext();
  }

  /** Stop the stream */
  stop(): void {
    this.active = false;
    if (this.intervalId !== null) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    this.callback = null;
  }

  /** Update quality preset dynamically */
  setQuality(quality: QualityPreset): void {
    this.currentQuality = quality;
    // Reschedule with new interval
    if (this.active) {
      if (this.intervalId !== null) {
        clearTimeout(this.intervalId);
        this.intervalId = null;
      }
      this.scheduleNext();
    }
  }

  /** Get the current quality preset */
  getQuality(): QualityPreset {
    return this.currentQuality;
  }

  /** Check if the stream is active */
  get isActive(): boolean {
    return this.active;
  }

  // ── Private ──────────────────────────────────────────────

  private scheduleNext(): void {
    if (!this.active) return;

    const profile = QUALITY_PROFILES[this.currentQuality];
    const interval = Math.max(this.config.minInterval, Math.min(profile.interval, this.config.maxInterval));

    this.intervalId = setTimeout(() => {
      this.captureAndNotify().finally(() => {
        if (this.active) this.scheduleNext();
      });
    }, interval);
  }

  private async captureAndNotify(): Promise<void> {
    if (!this.active || !this.callback) return;

    try {
      const now = Date.now();
      const isForcedFull =
        now - this.lastFullFrameTimestamp >= this.config.forcedFullFrameMs;
      const isDeltaLimit =
        this.consecutiveDeltas >= this.config.fullFrameAfterDeltas;

      // Capture screenshot
      const result = await this.automation.captureScreenshot(this.currentQuality);
      this.frameNumber++;

      // Simple delta: compare base64 strings (quick heuristic)
      const isSameFrame = this.lastFrameBase64 === result.base64;
      const isFullFrame = !isSameFrame || isForcedFull || isDeltaLimit;

      if (isFullFrame) {
        this.consecutiveDeltas = 0;
        this.lastFullFrameTimestamp = now;
      } else {
        this.consecutiveDeltas++;
      }

      this.lastFrameBase64 = result.base64;

      // Adaptive quality tuning: if we keep seeing the same frame,
      // gradually reduce quality to save resources
      if (this.consecutiveDeltas > 10 && this.currentQuality !== "low") {
        this.degradeQuality();
      }

      const frame: ScreenshotFrame = {
        sessionId: this.sessionId,
        base64: result.base64,
        delta: !isFullFrame,
        quality: result.quality,
        timestamp: result.timestamp,
        frameNumber: this.frameNumber,
        isFullFrame,
      };

      this.callback(frame);
    } catch (err) {
      // If automation is closed, stop streaming
      if (this.automation.isClosed) {
        this.stop();
      }
      // Otherwise carry on — errors are non-fatal for streaming
    }
  }

  /**
   * Degrade quality one step (ultra → high → medium → low).
   * Called when many consecutive identical frames are detected.
   */
  private degradeQuality(): void {
    const qualities: QualityPreset[] = ["ultra", "high", "medium", "low"];
    const currentIdx = qualities.indexOf(this.currentQuality);
    if (currentIdx < qualities.length - 1) {
      this.currentQuality = qualities[currentIdx + 1];
    }
  }
}