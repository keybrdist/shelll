# Shelll Agents

This project uses the following specialized agents to maintain code quality and functionality.

## Core Agents

- **General**: Handles multi-step tasks and research.
- **Explore**: Navigates the codebase to understand context and find files.
- **Opus/Sonnet**: High-level reasoning for complex refactors (manual invocation).

## Workflow

1. **Understand**: Use `grep` and `glob` to find relevant files.
2. **Plan**: Formulate a plan before editing.
3. **Implement**: Use `edit` or `write` to apply changes.
4. **Verify**: Run `npm run build` or `cargo check` to ensure stability.

## Special Instructions

- **Safety**: Always auto-redact secrets in the clipboard (handled by `App.tsx`).
- **Transparency**: Ensure `window-vibrancy` is correctly configured in `main.rs` and `tauri.conf.json`.
- **Performance**: Use `requestAnimationFrame` for block scanning to avoid UI jank.
