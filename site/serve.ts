// Production server for the built site. The TanStack Start build emits a portable
// fetch handler (dist/server/server.js) plus static client assets (dist/client);
// this wraps them in a Bun server on port 3000 — static files first, SSR for the
// rest, plus an /api/* REST layer and WebSocket endpoint for real-time screenshot
// streaming from the Assix automation engine.
//
// Run `bun run build` before starting. Restart it with `bun run publish`.

import handler from "./dist/server/server.js";
import { 
  getEngine, 
  shutdownEngine, 
  getSessionHistory, 
  getLeads 
} from "./src/lib/engine.js";
import { handleChatMessage } from "./src/lib/chat.js";

const PORT = 3000;
const HOST = "0.0.0.0";
const CLIENT_DIR = `${import.meta.dir}/dist/client`;

// Free PORT regardless of which user owns the current listener.
const freePort =
  `for _ in $(seq 1 25); do ` +
  `pids=$(lsof -t -iTCP:${String(PORT)} -sTCP:LISTEN 2>/dev/null || true); ` +
  `if [ -z "$pids" ]; then exit 0; fi; ` +
  `kill $pids 2>/dev/null || true; sleep 0.2; ` +
  `done`;

// ── API request handler ───────────────────────────────────

async function handleApi(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean); // ["api", "sessions", ...]
  const engine = getEngine();

  try {
    // POST /api/sessions — create a new browser session
    if (req.method === "POST" && segments[1] === "sessions" && !segments[2]) {
      const body = req.body ? (await req.json()) as Record<string, unknown> : {};
      const sessionId = await engine.createSession(body.config as Record<string, unknown>);
      const info = engine.getSessionInfo(sessionId);
      return json({ sessionId, info }, 201);
    }

    // GET /api/sessions — list all sessions
    if (req.method === "GET" && segments[1] === "sessions" && !segments[2]) {
      const sessions = engine.listSessions();
      return json({ sessions });
    }

    // GET /api/sessions/history — get session history
    if (req.method === "GET" && segments[1] === "sessions" && segments[2] === "history") {
      const history = getSessionHistory();
      return json({ history });
    }

    // GET /api/sessions/:id — get session info
    if (req.method === "GET" && segments[1] === "sessions" && segments[2]) {
      const info = engine.getSessionInfo(segments[2]);
      if (!info) return json({ error: "Session not found" }, 404);
      return json({ session: info });
    }

    // POST /api/sessions/:id/action — execute an action
    if (req.method === "POST" && segments[1] === "sessions" && segments[2] && segments[3] === "action") {
      const body = (await req.json()) as { type: string; params: Record<string, unknown> };
      const automation = engine.getAutomation(segments[2]);
      engine.setSessionStatus(segments[2], "busy");
      try {
        const result = await automation.executeAction(body.type as any, body.params as any);
        return json({ result });
      } finally {
        engine.setSessionStatus(segments[2], "idle");
      }
    }

    // POST /api/sessions/:id/close — close a session
    if (req.method === "POST" && segments[1] === "sessions" && segments[2] && segments[3] === "close") {
      await engine.closeSession(segments[2]);
      return json({ closed: true });
    }

    // POST /api/sessions/:id/screenshot — capture a screenshot
    if (req.method === "POST" && segments[1] === "sessions" && segments[2] && segments[3] === "screenshot") {
      const body = req.body ? (await req.json()) as Record<string, unknown> : {};
      const automation = engine.getAutomation(segments[2]);
      const result = await automation.captureScreenshot(body.quality as any);
      return json({ screenshot: result });
    }

    // POST /api/sessions/:id/save-storage — persist cookies/localStorage
    if (req.method === "POST" && segments[1] === "sessions" && segments[2] && segments[3] === "save-storage") {
      const storagePath = await engine.saveStorageState(segments[2]);
      return json({ path: storagePath });
    }

    // POST /api/sessions/:id/resume — resume human wait
    if (req.method === "POST" && segments[1] === "sessions" && segments[2] && segments[3] === "resume") {
      const body = req.body ? (await req.json()) as Record<string, unknown> : {};
      const waitId = body.waitId as string;
      if (!waitId) return json({ error: "waitId is required" }, 400);
      const resolved = engine.resumeHumanWait(segments[2], waitId, body.data as string | undefined);
      return json({ resolved });
    }

    // GET /api/sessions/:id/leads — get extracted leads for a session
    if (req.method === "GET" && segments[1] === "sessions" && segments[2] && segments[3] === "leads") {
      const leads = getLeads(segments[2]);
      return json({ leads });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── WebSocket handler (screenshot streaming) ──────────────

interface WsClient {
  sessionId: string;
  socket: WebSocket;
}

const wsClients = new Map<string, WsClient>();

// ── Main server ───────────────────────────────────────────

for (let attempt = 1; ; attempt++) {
  await Bun.$`sudo sh -c ${freePort}`.quiet().nothrow();
  try {
    Bun.serve<{ sessionId?: string }>({
      port: PORT,
      hostname: HOST,

      // WebSocket events
      websocket: {
        async message(ws, message) {
          try {
            const data = JSON.parse(message as string) as { type: string; sessionId?: string; action?: string; quality?: string };

            if (data.type === "subscribe" && data.sessionId) {
              const engine = getEngine();
              const stream = engine.getStream(data.sessionId);
              ws.data = { sessionId: data.sessionId };

              wsClients.set(ws.remoteAddress + ":" + ws.data.sessionId, {
                sessionId: data.sessionId,
                socket: ws as unknown as WebSocket,
              });

              // Start streaming screenshots
              stream.start((frame) => {
                try {
                  ws.send(JSON.stringify({ type: "frame", ...frame }));
                } catch {
                  stream.stop();
                }
              });

              ws.send(JSON.stringify({ type: "subscribed", sessionId: data.sessionId }));
            }

            if (data.type === "unsubscribe" && data.sessionId) {
              const engine = getEngine();
              try {
                const stream = engine.getStream(data.sessionId);
                stream.stop();
              } catch { /* already closed */ }
              ws.data = {};
            }

            if (data.type === "setQuality" && data.sessionId && data.quality) {
              const engine = getEngine();
              try {
                const stream = engine.getStream(data.sessionId);
                stream.setQuality(data.quality as any);
                ws.send(JSON.stringify({ type: "qualitySet", quality: data.quality }));
              } catch { /* ignore */ }
            }

            // ── Human Resume (for waitForHuman) ──────────────
            if ((data.type === "human-resume" || data.type === "chat-resume") && data.sessionId) {
              const engine = getEngine();
              const waitId = (data as any).waitId as string | undefined;
              const inputData = (data as any).data as string | undefined;

              let resolved = false;
              if (waitId) {
                resolved = engine.resumeHumanWait(data.sessionId, waitId, inputData);
              } else {
                // No specific waitId — resume any pending human wait on this session.
                // This handles the case where the user clicks "Resume" after an
                // interrupt without tracking the specific waitId.
                resolved = engine.resumeAnyHumanWait(data.sessionId, inputData);
              }

              if (resolved) {
                ws.send(JSON.stringify({
                  type: "chat-response",
                  status: "human-resumed",
                  sessionId: data.sessionId,
                  message: "Execution resumed after human intervention.",
                }));
              } else if (!waitId) {
                // Tried resumeAnyHumanWait but no pending waits found
                ws.send(JSON.stringify({
                  type: "chat-response",
                  status: "warning",
                  message: `No pending human wait on session ${data.sessionId}. The wait may have already been resolved or timed out.`,
                }));
              } else {
                ws.send(JSON.stringify({
                  type: "chat-response",
                  status: "error",
                  message: `No pending human wait found for waitId '${waitId}' on session ${data.sessionId}. It may have already been resolved or timed out.`,
                }));
              }
            }

            // ── Chat (AI Assistant) ──────────────────────────
            if (data.type === "chat-send" && (data as any).prompt) {
              const prompt = (data as any).prompt as string;
              const sessionId = (data as any).sessionId as string | undefined;

              // Process in background, send progress via ws
              handleChatMessage(prompt, sessionId ?? null, (msg) => {
                try {
                  ws.send(JSON.stringify(msg));
                } catch { /* client disconnected */ }
              }).catch((err) => {
                try {
                  ws.send(JSON.stringify({
                    type: "chat-response",
                    status: "error",
                    message: err instanceof Error ? err.message : String(err),
                  }));
                } catch { /* ignore */ }
              });
            }

            // ── Direct Interaction (user clicking/typing on live stream) ──
            if ((data.type === "direct-click" || data.type === "direct-move") && data.sessionId) {
              const engine = getEngine();
              const actionType = data.type === "direct-click" ? "mouseClick" : "mouseMove";
              const params = {
                x: (data as any).x ?? 0,
                y: (data as any).y ?? 0,
                button: (data as any).button,
                clickCount: (data as any).clickCount,
                fromWidth: (data as any).fromWidth ?? 1280,
                fromHeight: (data as any).fromHeight ?? 720,
                timeout: 5000,
              };

              try {
                const automation = engine.getAutomation(data.sessionId);
                const result = await automation.executeAction(actionType as any, params as any, false);
                ws.send(JSON.stringify({
                  type: "direct-result",
                  action: data.type,
                  success: result.success,
                  message: result.message,
                }));
              } catch (err) {
                ws.send(JSON.stringify({
                  type: "direct-result",
                  action: data.type,
                  success: false,
                  message: err instanceof Error ? err.message : String(err),
                }));
              }
            }

            if (data.type === "direct-type" && data.sessionId) {
              const engine = getEngine();
              const params = {
                text: (data as any).text ?? "",
                delay: (data as any).delay,
                timeout: 10_000,
              };

              try {
                const automation = engine.getAutomation(data.sessionId);
                const result = await automation.executeAction("keyboardType" as any, params as any, false);
                ws.send(JSON.stringify({
                  type: "direct-result",
                  action: "direct-type",
                  success: result.success,
                  message: result.message,
                }));
              } catch (err) {
                ws.send(JSON.stringify({
                  type: "direct-result",
                  action: "direct-type",
                  success: false,
                  message: err instanceof Error ? err.message : String(err),
                }));
              }
            }

            // ── Interrupt / Force Resume ──
            if (data.type === "interrupt" && data.sessionId) {
              const engine = getEngine();
              try {
                const automation = engine.getAutomation(data.sessionId);
                automation.interrupt();
                ws.send(JSON.stringify({
                  type: "interrupted",
                  sessionId: data.sessionId,
                  message: "Engine interrupted. All pending actions cancelled.",
                }));
              } catch (err) {
                ws.send(JSON.stringify({
                  type: "interrupt-error",
                  sessionId: data.sessionId,
                  message: err instanceof Error ? err.message : String(err),
                }));
              }
            }
          } catch { /* ignore invalid JSON */ }
        },
        close(ws) {
          // Clean up subscriptions
          for (const [key, client] of wsClients) {
            if (client.socket === (ws as unknown as WebSocket)) {
              wsClients.delete(key);
              try {
                const engine = getEngine();
                const stream = engine.getStream(client.sessionId);
                stream.stop();
              } catch { /* already closed */ }
            }
          }
        },
      },

      async fetch(req, server) {
        const url = new URL(req.url);

        // WebSocket upgrade
        if (url.pathname === "/ws" && req.headers.get("upgrade") === "websocket") {
          const upgraded = server.upgrade(req);
          if (!upgraded) {
            return new Response("WebSocket upgrade failed", { status: 400 });
          }
          // Bun.upgrade doesn't return a Response — it returns boolean or void
          // The upgrade is handled by Bun internally
        }

        // API routes
        if (url.pathname.startsWith("/api/")) {
          return handleApi(req);
        }

        // Static files (client assets)
        if (url.pathname !== "/") {
          const file = Bun.file(CLIENT_DIR + url.pathname);
          if (await file.exists()) return new Response(file);
        }

        // SSR handler
        return (
          handler as { fetch: (r: Request) => Response | Promise<Response> }
        ).fetch(req);
      },
    });
    break;
  } catch (err) {
    if (attempt >= 10) throw err;
    await Bun.sleep(200);
  }
}

console.log(`Assix serving on http://${HOST}:${String(PORT)} — API at /api/, WS at /ws`);
