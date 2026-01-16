# shelll

A tiny terminal that overlays on top of your workspace for quick short-lived terminal sessions. Designed for clipboard-first workflows.

## Features
- **Overlay Mode**: Always on top, transparent background with native macOS vibrancy.
- **Ghost Mode**: Window fades to 20% opacity when not hovered, allowing you to read behind it.
- **Block Selection**: Automatically detects paragraphs/blocks and adds "Copy" buttons.
- **Quick Copy**: One-click copy for blocks, or use the "Basket" to select multiple blocks.
- **Privacy First**: Auto-redacts sensitive keys and secrets by default.
- **Social Ready**: Preset window sizes for sharing screenshots on social media.

## Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run in development mode:
   ```bash
   npm run tauri dev
   ```

3. Build for production:
   ```bash
   npm run tauri build
   ```
