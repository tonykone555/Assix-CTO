<!-- managed:linked-repos -->
## Linked Repositories
- tonykone555/Assix-CTO
<!-- /managed:linked-repos -->

# Assix Team Workflow

## WebSocket Protocol: Human Intervention

When the AI Orchestrator or Automation Engine detects that user input is needed (e.g., login, 2FA), the following flow must be followed:

1.  **Backend to Frontend** (via WebSocket):
    -   `type`: `chat-response`
    -   `status`: `human-intervention-needed`
    -   `interventionType`: `login` | `2fa` | `generic`
    -   `message`: Instruction for the user (e.g., "Please log in to your Airbnb account.")
    -   `sessionId`: The current session ID.

2.  **Frontend Action**:
    -   Displays a modal or overlay to the user with the message.
    -   Keeps the Live Viewer active so the user can interact with the site.
    -   Provides a "Resume" button and/or an input field for data (like a 2FA code).

3.  **Frontend to Backend** (via WebSocket):
    -   `type`: `chat-resume`
    -   `sessionId`: The current session ID.
    -   `data`: (Optional) The data entered by the user (e.g., `{ code: '123456' }`).

4.  **Backend Action**:
    -   The `waitForHuman` Promise in the `BrowserAutomation` instance resolves with the provided data.
    -   If data was provided (like a 2FA code), the automation should use it (e.g., by typing it into a field identified by the AI).
    -   Execution of the plan continues.

## Session Persistence

-   **Storage Path**: `/home/team/shared/sessions/[sessionId].json`
-   **Format**: Playwright `storageState` (JSON).
-   **Logic**:
    -   `SessionManager` should save the state after successful logins or at the end of a session.
    -   `SessionManager` should load the state if a session is resumed or if a "saved login" is requested.

## Code Delivery & GitHub Sync

-   **Main Repository**: `tonykone555/Assix-CTO`
-   **Primary Branch**: `main`
-   **Sync Workflow**:
    -   `agent-git-specialist` is responsible for pushing code updates.
    -   Team members should notify the lead when a task is completed and ready for push.
    -   The lead will assign a sync task to `agent-git-specialist` or use an automated trigger.
    -   All commits must follow the conventional commit format (e.g., `feat:`, `fix:`, `docs:`).
