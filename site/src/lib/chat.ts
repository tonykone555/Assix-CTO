/**
 * Chat Bridge — connects WebSocket chat messages to the AI Orchestrator
 * and Automation Engine.
 *
 * Flow:
 *   Client sends `chat-send` (prompt)
 *   → orchestrator.translateIntent(prompt) → returns action plan
 *   → Each action executed via engine
 *   → Progress `chat-response` messages sent back to client
 *
 * Human intervention:
 *   When the plan includes a `waitForHuman` action, execution pauses
 *   and a `human-intervention-needed` status is sent. The client can
 *   resume via `human-resume` WebSocket message.
 */

import { AIOrchestrator } from "ai-orchestrator";
import { getEngine, setSessionSummary, getSavedSessions, saveLead } from "./engine.js";

/** Callback type for sending progress updates to the client */
export type ProgressSender = (msg: object) => void;

interface ActionStep {
  type: string;
  params: Record<string, unknown>;
  description?: string;
}

/**
 * Handle a chat message from a user.
 *
 * @param prompt - The natural language prompt from the user
 * @param sessionId - Existing browser session ID (or empty to create new)
 * @param sendProgress - Callback to send progress messages to the client
 * @returns The final summary result
 */
export async function handleChatMessage(
  prompt: string,
  sessionId: string | null,
  sendProgress: ProgressSender,
): Promise<{ sessionId: string; summary: string; success: boolean }> {
  const engine = getEngine();
  const apiKey = process.env.GROQ_API_KEY;
  const orchestrator = apiKey ? new AIOrchestrator({ apiKey }) : null;

  // ── Step 1: Ensure a browser session ──
  let targetSessionId = sessionId;
  if (!targetSessionId) {
    let suggestedName: string | null = null;
    if (orchestrator) {
      suggestedName = await orchestrator.suggestSessionName(prompt);
    }

    sendProgress({ type: "chat-response", status: "creating-session", message: "Launching browser session…" });
    
    targetSessionId = await engine.createSession({
      headless: true,
      browserType: "chromium",
      persistSession: true,
      sessionId: suggestedName ?? undefined,
    });
    
    sendProgress({
      type: "chat-response",
      status: "session-ready",
      sessionId: targetSessionId,
      message: suggestedName 
        ? `Using session for "${suggestedName}"`
        : `New session ${targetSessionId.slice(0, 8)}… ready`,
    });
  }

  const automation = engine.getAutomation(targetSessionId);

  // ── Step 2: Get the API key and plan via orchestrator ──
  if (apiKey && orchestrator) {
    // ── Real AI mode ──
    sendProgress({
      type: "chat-response",
      status: "thinking",
      message: "Analyzing your request…",
    });

    let plan: ActionStep[];
    try {
      const savedSessions = getSavedSessions();
      plan = await orchestrator.translateIntent(prompt, targetSessionId, savedSessions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendProgress({
        type: "chat-response",
        status: "error",
        message: `Failed to parse AI response: ${msg}`,
      });
      return { sessionId: targetSessionId, summary: msg, success: false };
    }

    if (!plan || plan.length === 0) {
      sendProgress({
        type: "chat-response",
        status: "error",
        message: "AI returned an empty plan. Try rephrasing your request.",
      });
      return { sessionId: targetSessionId, summary: "Empty plan from AI", success: false };
    }

    // ── Step 3: Execute the plan ──
    sendProgress({
      type: "chat-response",
      status: "executing",
      totalSteps: plan.length,
      message: `Executing ${plan.length} step(s)…`,
    });

    const results: { step: number; description: string; success: boolean; message: string }[] = [];

    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      const desc = step.description || `${step.type} action`;

      sendProgress({
        type: "chat-response",
        status: "step-start",
        step: i + 1,
        totalSteps: plan.length,
        description: desc,
        message: `Step ${i + 1}/${plan.length}: ${desc}`,
      });

      engine.setSessionStatus(targetSessionId, "busy");
      try {
        // ── Special handling for saveLeads ──
        if (step.type === "saveLeads") {
          const leads = (step.params as any).leads || [];
          for (const lead of leads) {
            saveLead(targetSessionId, lead);
          }
          results.push({
            step: i + 1,
            description: desc,
            success: true,
            message: `Saved ${leads.length} lead(s) to database`,
          });
          sendProgress({
            type: "chat-response",
            status: "step-done",
            step: i + 1,
            totalSteps: plan.length,
            description: desc,
            message: `Successfully saved ${leads.length} lead(s)`,
          });
          continue;
        }

        // ── Special handling for waitForHuman ──
        if (step.type === "waitForHuman") {
          const msg = (step.params as any).message || "Human intervention required";

          sendProgress({
            type: "chat-response",
            status: "human-intervention-needed",
            step: i + 1,
            totalSteps: plan.length,
            description: desc,
            message: msg,
            sessionId: targetSessionId,
          });

          // Execute waitForHuman — this creates a promise that blocks until
          // the engine's resumeHumanWait() is called from the WebSocket handler
          const result = await automation.executeAction("waitForHuman", step.params);

          // ── Handle interruption during waitForHuman ──
          if (!result.success && result.error?.code === 'INTERRUPTED') {
            sendProgress({
              type: "chat-response",
              status: "interrupted-waiting-for-resume",
              step: i + 1,
              totalSteps: plan.length,
              description: desc,
              message: `Step ${i + 1} was interrupted. Fix the page manually, then click Resume to retry this step.`,
              sessionId: targetSessionId,
            });

            // Block until user clicks Resume
            const resumeResult = await automation.executeAction("waitForHuman", {
              message: `Step ${i + 1} ("${desc}") was interrupted. Make any needed manual adjustments, then click Resume to retry.`,
            });

            if (resumeResult.success) {
              sendProgress({
                type: "chat-response",
                status: "resume-ready",
                step: i + 1,
                totalSteps: plan.length,
                description: desc,
                message: "Resuming — retrying interrupted step...",
                sessionId: targetSessionId,
              });
              i--; // Retry this step
              continue;
            } else {
              sendProgress({
                type: "chat-response",
                status: "plan-aborted",
                message: `Plan aborted at step ${i + 1}: ${resumeResult.message}`,
              });
              return {
                sessionId: targetSessionId,
                summary: `Aborted at step ${i + 1}: ${desc}`,
                success: false,
              };
            }
          }

          results.push({
            step: i + 1,
            description: desc,
            success: result.success,
            message: result.message,
          });

          if (result.success) {
            sendProgress({
              type: "chat-response",
              status: "step-done",
              step: i + 1,
              totalSteps: plan.length,
              description: desc,
              message: result.message,
              data: result.data,
            });
          } else {
            sendProgress({
              type: "chat-response",
              status: "step-error",
              step: i + 1,
              totalSteps: plan.length,
              description: desc,
              message: result.error?.message || result.message,
              error: result.error,
            });
            if (result.error?.severity === "fatal") {
              return {
                sessionId: targetSessionId,
                summary: `Failed at step ${i + 1}: ${desc} — ${result.error.message}`,
                success: false,
              };
            }
          }
          continue;
        }

        const result = await automation.executeAction(
          step.type as any,
          step.params as any,
        );

        // ── Handle interruption during a regular action ──
        if (!result.success && result.error?.code === 'INTERRUPTED') {
          sendProgress({
            type: "chat-response",
            status: "interrupted-waiting-for-resume",
            step: i + 1,
            totalSteps: plan.length,
            description: desc,
            message: `Step ${i + 1} was interrupted. Fix the page manually, then click Resume to retry this step.`,
            sessionId: targetSessionId,
          });

          // Block until user clicks Resume
          const resumeResult = await automation.executeAction("waitForHuman", {
            message: `Step ${i + 1} ("${desc}") was interrupted. Make any needed manual adjustments, then click Resume to retry.`,
          });

          if (resumeResult.success) {
            sendProgress({
              type: "chat-response",
              status: "resume-ready",
              step: i + 1,
              totalSteps: plan.length,
              description: desc,
              message: "Resuming — retrying interrupted step...",
              sessionId: targetSessionId,
            });
            i--; // Retry this step
            continue;
          } else {
            sendProgress({
              type: "chat-response",
              status: "plan-aborted",
              message: `Plan aborted at step ${i + 1}: ${resumeResult.message}`,
            });
            return {
              sessionId: targetSessionId,
              summary: `Aborted at step ${i + 1}: ${desc}`,
              success: false,
            };
          }
        }

        results.push({
          step: i + 1,
          description: desc,
          success: result.success,
          message: result.message,
        });

        if (result.success) {
          sendProgress({
            type: "chat-response",
            status: "step-done",
            step: i + 1,
            totalSteps: plan.length,
            description: desc,
            message: result.message,
            data: result.data,
          });
        } else {
          sendProgress({
            type: "chat-response",
            status: "step-error",
            step: i + 1,
            totalSteps: plan.length,
            description: desc,
            message: result.error?.message || result.message,
            error: result.error,
          });

          // If fatal, stop the plan
          if (result.error?.severity === "fatal") {
            sendProgress({
              type: "chat-response",
              status: "plan-aborted",
              message: `Plan aborted at step ${i + 1}: ${result.error.message}`,
            });
            return {
              sessionId: targetSessionId,
              summary: `Failed at step ${i + 1}: ${desc} — ${result.error.message}`,
              success: false,
            };
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ step: i + 1, description: desc, success: false, message: msg });
        sendProgress({
          type: "chat-response",
          status: "step-error",
          step: i + 1,
          totalSteps: plan.length,
          description: desc,
          message: msg,
        });
      } finally {
        engine.setSessionStatus(targetSessionId, "idle");
      }
    }

    // ── Step 4: Generate and send final summary ──
    const successCount = results.filter((r) => r.success).length;
    const allSuccess = successCount === plan.length;

    sendProgress({
      type: "chat-response",
      status: "thinking",
      message: "Generating summary…",
    });

    const summary = await orchestrator.generateSummary(prompt, results);

    // Save summary to database
    setSessionSummary(targetSessionId, summary);

    // Save storage state after successful completion
    if (plan.length > 0 && allSuccess) {
      engine.saveStorageState(targetSessionId).catch(() => {});
    }

    sendProgress({
      type: "chat-response",
      status: "done",
      sessionId: targetSessionId,
      message: summary,
      results,
      success: allSuccess,
    });

    return { sessionId: targetSessionId, summary, success: allSuccess };

  } else {
    // ── Mock mode (no API key) ──
    sendProgress({
      type: "chat-response",
      status: "mock",
      message: "AI Orchestrator is in mock mode (no GROQ_API_KEY set). Simulating response…",
    });

    // Parse the prompt to guess intent
    const plan = mockTranslate(prompt);
    sendProgress({
      type: "chat-response",
      status: "executing",
      totalSteps: plan.length,
      message: `Mock: ${plan.length} step(s) planned`,
    });

    const results: { step: number; description: string; success: boolean; message: string }[] = [];

    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      sendProgress({
        type: "chat-response",
        status: "step-start",
        step: i + 1,
        totalSteps: plan.length,
        description: step.description || step.type,
        message: `Step ${i + 1}: ${step.description || step.type}`,
      });
      engine.setSessionStatus(targetSessionId, "busy");
      try {
        const result = await automation.executeAction(step.type as any, step.params as any);
        results.push({
          step: i + 1,
          description: step.description || step.type,
          success: result.success,
          message: result.message,
        });
        sendProgress({
          type: "chat-response",
          status: result.success ? "step-done" : "step-error",
          step: i + 1,
          totalSteps: plan.length,
          description: step.description || step.type,
          message: result.message,
          data: result.data,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          step: i + 1,
          description: step.description || step.type,
          success: false,
          message: msg,
        });
        sendProgress({
          type: "chat-response",
          status: "step-error",
          step: i + 1,
          totalSteps: plan.length,
          description: step.description || step.type,
          message: msg,
        });
      } finally {
        engine.setSessionStatus(targetSessionId, "idle");
      }
    }

    const summary = results.every(r => r.success) 
      ? "Mock execution completed successfully. All steps were simulated."
      : "Mock execution completed with some simulated errors.";

    // Save summary to database
    setSessionSummary(targetSessionId, summary);

    sendProgress({
      type: "chat-response",
      status: "done",
      sessionId: targetSessionId,
      message: summary,
      results,
      mock: true,
    });

    return { sessionId: targetSessionId, summary, success: true };
  }
}

/**
 * Simple mock translator for when no API key is set.
 * Handles common patterns like "go to X", "click Y", "search for Z".
 */
function mockTranslate(prompt: string): ActionStep[] {
  const lower = prompt.toLowerCase();
  const steps: ActionStep[] = [];

  // Detect URL navigation
  const urlMatch = prompt.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    steps.push({
      type: "navigate",
      params: { url: urlMatch[0] },
      description: `Navigate to ${urlMatch[0]}`,
    });
  } else if (lower.includes("go to ") || lower.includes("navigate to ") || lower.includes("open ")) {
    const siteMatch = prompt.match(/(?:go to|navigate to|open)\s+(\S+)/i);
    const site = siteMatch ? siteMatch[1] : "example.com";
    const url = site.startsWith("http") ? site : `https://${site}`;
    steps.push({
      type: "navigate",
      params: { url },
      description: `Navigate to ${url}`,
    });
  } else {
    steps.push({
      type: "navigate",
      params: { url: "https://www.google.com" },
      description: "Navigate to Google",
    });
  }

  if (lower.includes("search for ") || lower.includes("search ")) {
    const queryMatch = prompt.match(/(?:search for|search)\s+(.+)/i);
    const query = queryMatch ? queryMatch[1].trim() : prompt;
    steps.push({
      type: "waitForSelector",
      params: { selector: "textarea[name='q'], input[name='q']" },
      description: "Wait for search box",
    });
    steps.push({
      type: "type",
      params: { selector: "textarea[name='q'], input[name='q']", value: query, clearFirst: true },
      description: `Type search query: "${query}"`,
    });
    steps.push({
      type: "pressKey",
      params: { key: "Enter" },
      description: "Press Enter to search",
    });
    steps.push({
      type: "waitForSelector",
      params: { selector: "#search, #rso", timeout: 5000 },
      description: "Wait for search results",
    });
    steps.push({
      type: "extractText",
      params: { selector: "h3", first: true },
      description: "Extract first result title",
    });
  }

  if (lower.includes("click ")) {
    const clickTarget = prompt.match(/click\s+(?:on\s+)?["']?(.+?)["']?(?:\s|$)/i);
    if (clickTarget) {
      const selector = clickTarget[1].trim();
      steps.push({
        type: "click",
        params: { selector },
        description: `Click "${selector}"`,
      });
    }
  }

  if (lower.includes("screenshot") || lower.includes("capture")) {
    steps.push({
      type: "screenshot",
      params: { fullPage: false, quality: "medium" },
      description: "Capture screenshot",
    });
  }

  if (lower.includes("extract") || lower.includes("get text") || lower.includes("scrape")) {
    const selMatch = prompt.match(/(?:from|of|on)\s+["']?(.+?)["']?(?:\s|$)/i);
    steps.push({
      type: "extractText",
      params: { selector: selMatch ? selMatch[1].trim() : "body", first: true },
      description: "Extract text from page",
    });
  }

  return steps;
}