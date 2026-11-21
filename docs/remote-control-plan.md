# DualMind assistant integration

Status: **protocol foundation only**. The app is NOT remotely connected to ChatGPT yet.

## Goal
Allow an authenticated assistant integration to inspect app health, diagnose failures,
configure model providers, and request tasks, without exposing the rest of the device.

## Implemented
- `utils/dualmind-control-protocol.ts`: versioned allowlist of control actions
- Validation of command identifiers, action types, and action-specific parameters
- Diagnostic redaction of common API key, token and password fields
- Explicit confirmation classification for model switching and task cancellation

## Next integration steps
1. Connect read-only status and diagnostics adapters to the actual Expo application state.
2. Add an opt-in control panel, audit history, and a visible connected/disconnected indicator.
3. Implement short-lived authenticated pairing and encrypted transport. Never store pairing
   tokens in GitHub or logs. Reject replayed commands and expired sessions.
4. Require explicit user confirmation for mutating commands; offer an emergency disconnect.
5. Add model selection and provider health checks, with secrets stored in device secure storage.
6. Add a task executor with constrained capabilities, progress reporting and cancellation.
7. Test on a real Android device, then build and publish an updated APK.

## Security boundaries
- No arbitrary shell execution, unrestricted filesystem access or access to unrelated apps.
- Never send API keys, private conversations or personal files as diagnostics by default.
- Diagnostic redaction is defense-in-depth, not a substitute for schema-based data minimization.
- Read-only commands require authenticated pairing too.
- A GitHub commit alone cannot update an APK already installed on a phone.
- ChatGPT sessions cannot maintain a permanent device connection on their own. A separate
  service or explicitly initiated connection is required for live telemetry and commands.
