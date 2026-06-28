# Assix Automation Engine

The core browser automation engine for the Assix live-preview platform. Built on Playwright, it provides a session-based API for executing browser actions with real-time screenshot streaming.

## Architecture

```
engine/                          # Core engine library
├── src/
│   ├── index.ts                 # Exports
│   ├── types.ts                 # All type definitions & configs
│   ├── errors.ts                # Error handling, classification, retry logic
│   ├── SessionManager.ts        # Multi-session lifecycle management
│   ├── BrowserAutomation.ts     # Core browser action execution (25+ action types)
│   └── ScreenshotStream.ts      # Adaptive-quality screenshot streaming
├── dist/                        # Compiled JS output
├── package.json
└── tsconfig.json

site/                            # TanStack Start frontend + integration
├── src/
│   ├── lib/
│   │   └── engine.ts            # Engine singleton (server-only)
│   └── routes/
│       └── index.tsx             # Landing page
├── serve.ts                     # Production server (HTTP + WebSocket + API)
└── publish.sh                   # Build & deploy script
```

## Features

### 1. Robust Error Handling (`errors.ts`)
- **Structured error classes**: `ActionFailedError`, `FatalError`, `TransientError`
- **Error classification**: `classifyPlaywrightError()` maps Playwright exceptions to structured `ActionError` objects with codes, severity, and retryability
- **Automatic retry**: `withRetry()` with exponential backoff + jitter for flaky operations (navigations, clicks, waits)
- **Error codes**: Comprehensive error codes (NAVIGATION_FAILED, SELECTOR_NOT_FOUND, TIMEOUT, BROWSER_CRASHED, etc.)

### 2. Extended Browser Interactions (`BrowserAutomation.ts`)
- `hover` — Hover with position, modifiers, force options
- `dragAndDrop` — Native drag-to-target + force mode using manual mouse events
- `scroll` — Scroll by delta on page or specific element
- `scrollIntoView` — Scroll element into view with alignment control
- `pressKey` — Keyboard shortcuts (Control+A, Enter, etc.)
- `check` / `uncheck` — Checkbox toggling
- `focus` — Element focus
- `fileChooser` — File upload via system dialog
- `evaluate` — Arbitrary JS execution in page context
- `extractText` / `extractHtml` / `extractAttribute` — Data extraction
- Plus standard actions: navigate, click, type, select, waitForSelector, screenshot, reload, goBack, goForward, close

### 3. Efficient Screenshot Streaming (`ScreenshotStream.ts`)
- **Adaptive quality**: Degrades quality (ultra→high→medium→low) when frames are identical, saving bandwidth
- **Delta detection**: Sends metadata when frames haven't changed, avoids redundant data transfer
- **Periodic full frames**: Forces a full-quality frame every 10s or after 30 consecutive deltas
- **Configurable intervals**: Per-quality-preset capture intervals (50ms ultra to 500ms low)
- **Dynamic quality control**: Quality can be changed mid-stream via API

### 4. Multiple Concurrent Sessions (`SessionManager.ts`)
- **Session lifecycle**: Create → Execute actions → Close, with full tracking
- **Concurrency limit**: Configurable max sessions (default: 10)
- **Inactivity cleanup**: Auto-closes sessions after 30 minutes idle
- **Status tracking**: Per-session idle/busy status for queue management
- **Rich session info**: URL, viewport, action count, error count, timestamps

## API Endpoints

The engine is exposed via HTTP and WebSocket on port 3000:

### REST API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sessions` | Create a new browser session |
| `GET` | `/api/sessions` | List all active sessions |
| `GET` | `/api/sessions/:id` | Get session details |
| `POST` | `/api/sessions/:id/action` | Execute an action on a session |
| `POST` | `/api/sessions/:id/close` | Close a session |
| `POST` | `/api/sessions/:id/screenshot` | Capture a screenshot |

### WebSocket (`/ws`)

| Message Type | Payload | Description |
|---|---|---|
| `subscribe` | `{ sessionId }` | Start screenshot streaming |
| `unsubscribe` | `{ sessionId }` | Stop screenshot streaming |
| `setQuality` | `{ sessionId, quality }` | Change quality mid-stream |
| `frame` | *(server push)* | Screenshot frame (base64 JPEG) |

## Usage

```typescript
import { SessionManager } from "@assix/automation-engine";

const engine = new SessionManager(10);

// Create a session
const sessionId = await engine.createSession({
  browserType: "chromium",
  headless: true,
});

// Execute actions
const automation = engine.getAutomation(sessionId);
const result = await automation.executeAction("navigate", {
  url: "https://example.com",
});
await automation.executeAction("click", {
  selector: "#button",
});
const text = await automation.executeAction("extractText", {
  selector: "h1",
  first: true,
});

// Close
await engine.closeSession(sessionId);
await engine.closeAllSessions();
```

## Development

```bash
# Build the engine
cd /home/team/shared/engine && npm run build

# Install in the site
cd /home/team/shared/site && npm install

# Build and publish the site
cd /home/team/shared/site && bun run publish
```
