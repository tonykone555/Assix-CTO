/**
 * Engine singleton — shared automation engine instance.
 * Server-only: this module is never imported by client code.
 *
 * Wires up lifecycle callbacks to persist session history to the
 * shared team database via the `team-db` CLI tool.
 */

import { SessionManager, type SessionLifecycleCallbacks } from "@assix/automation-engine";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const STORAGE_DIR = "/home/team/shared/sessions";

let engine: SessionManager | null = null;

/** Shell out to team-db CLI with a SQL statement */
function dbExec(sql: string): void {
  try {
    execSync(`team-db "${sql.replace(/"/g, '\\"')}"`, {
      timeout: 10_000,
      stdio: "pipe",
    });
  } catch (err) {
    console.error("[engine] DB write failed:", err instanceof Error ? err.message : String(err));
  }
}

/** Generate a UUID-style ID */
function generateId(): string {
  const hex = "0123456789abcdef";
  let id = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) id += "-";
    else id += hex[Math.floor(Math.random() * 16)];
  }
  return id;
}

/**
 * Get or create the shared engine instance.
 */
export function getEngine(): SessionManager {
  if (!engine) {
    const callbacks: SessionLifecycleCallbacks = {
      onSessionCreated: (sessionId, browserType, config) => {
        const now = new Date().toISOString();
        const configJson = JSON.stringify(config).replace(/'/g, "''");
        const id = generateId();
        dbExec(
          `INSERT INTO session_history (id, sessionId, browserType, status, createdAt, configJson) VALUES ('${id}', '${sessionId}', '${browserType}', 'created', '${now}', '${configJson}')`,
        );
      },
      onSessionClosed: (sessionId, status, actionCount, errorCount, error) => {
        const endedAt = new Date().toISOString();
        const errorStr = error ? error.message.replace(/'/g, "''") : "";
        dbExec(
          `UPDATE session_history SET status = '${status}', endedAt = '${endedAt}', actionCount = ${actionCount}, errorCount = ${errorCount}, result = '${errorStr}' WHERE sessionId = '${sessionId}' AND status = 'created'`,
        );
      },
    };

    engine = new SessionManager(10, callbacks);
    console.log("[engine] Automation engine initialized (max 10 sessions, history persistence active)");
  }
  return engine;
}

/** Update the summary for a session history record */
export function setSessionSummary(sessionId: string, summary: string): void {
  const sanitizedSummary = summary.replace(/'/g, "''");
  dbExec(
    `UPDATE session_history SET summary = '${sanitizedSummary}' WHERE sessionId = '${sessionId}'`
  );
}

/** Get session history from the database */
export function getSessionHistory(limit = 50): Array<Record<string, unknown>> {
  try {
    const result = execSync(
      `team-db "SELECT * FROM session_history ORDER BY createdAt DESC LIMIT ${limit}"`,
      { timeout: 10_000, encoding: "utf-8" },
    );
    return JSON.parse(result.trim()) as Array<Record<string, unknown>>;
  } catch (err) {
    console.error("[engine] Failed to read session history:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

/** Get a list of saved session IDs from disk */
export function getSavedSessions(): string[] {
  try {
    if (!fs.existsSync(STORAGE_DIR)) return [];
    const files = fs.readdirSync(STORAGE_DIR);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => path.basename(f, ".json"));
  } catch (err) {
    console.error("[engine] Failed to list saved sessions:", err);
    return [];
  }
}

/**
 * Cleanup all sessions (call on shutdown).
 */
export async function shutdownEngine(): Promise<void> {
  if (engine) {
    await engine.closeAllSessions();
    engine = null;
    console.log("[engine] Engine shut down");
  }
}