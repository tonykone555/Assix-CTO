# Assix AI Orchestrator

The AI Orchestrator is responsible for translating natural language user intent into a structured sequence of browser actions that can be executed by the Assix Automation Engine.

## Features

- **Natural Language Translation**: Uses Groq (LLama 3) to parse user instructions.
- **Structured Output**: Produces a JSON array of actions validated against a Zod schema.
- **Comprehensive Action Support**: Supports all 25+ action types provided by the core engine.
- **Context-Aware Prompts**: Includes specialized instructions for scraping, outreach, and multi-step workflows.

## Project Structure

- `src/index.ts`: Main `AIOrchestrator` class.
- `src/schema.ts`: Zod schemas for all action types and parameters.
- `src/prompts.ts`: System prompts and guidelines for the LLM.
- `test-orchestrator.ts`: A test script to verify translation (requires `GROQ_API_KEY`).

## Integration

The orchestrator is designed to be used within the Assix server to handle chat commands from the dashboard.

```typescript
import { AIOrchestrator } from "@assix/ai-orchestrator";

const orchestrator = new AIOrchestrator({ apiKey: process.env.GROQ_API_KEY });
const actions = await orchestrator.translateIntent("Find apartments in Tokyo on Airbnb");
// Execute actions via Automation Engine...
```

## Primitives Supported

The orchestrator maps NL to the following engine primitives:
- `navigate`, `click`, `type`, `select`, `hover`, `dragAndDrop`, `scroll`, `scrollIntoView`, `screenshot`, `extractText`, `extractHtml`, `extractAttribute`, `waitForSelector`, `waitForNavigation`, `waitForTimeout`, `evaluate`, `pressKey`, `check`, `uncheck`, `focus`, `fileChooser`, `reload`, `goBack`, `goForward`, `close`.
