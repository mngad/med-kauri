# med — Tauri (Rust) Rewrite — Implementation Plan

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│  Tauri shell (Rust backend)                 │
│  ┌───────────────────────────────────────┐  │
│  │  WebView (HTML/CSS/JS frontend)       │  │
│  │  ┌──────────┬──────────────────────┐  │  │
│  │  │ Editor    │  Preview             │  │  │
│  │  │(CodeMirror)│ (rendered Markdown)  │  │  │
│  │  └──────────┴──────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
│  Rust commands: file I/O, menus, dialogs    │
└─────────────────────────────────────────────┘
```

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Window shell | Tauri + Rust | Frameless window, custom traffic lights, menus, file dialogs, edge resize |
| Frontend | HTML + CSS + JS | Editor (CodeMirror 6), preview (marked.js / markdown-it), UI chrome |
| Markdown parsing | JS (frontend) or Rust (comrak) | Parse MD → HTML for preview |
| Syntax highlighting | highlight.js or Prism.js | Code block highlighting in preview |
| State | Tauri State + Svelte/React store | File path, dirty flag, theme, fonts |
| Settings | Rust (serde + JSON file) | Persist theme, fonts, geometry |

---

## Phase 0: Project Scaffolding

### Step 0.1 — Tauri project init
- `cargo install create-tauri-app` (or `npm create tauri-app`)
- Choose: Rust backend, vanilla HTML/CSS/JS or Svelte frontend
- Project structure:
  ```
  med-tauri/
  ├── src-tauri/       # Rust backend
  │   ├── Cargo.toml
  │   ├── tauri.conf.json
  │   └── src/
  │       ├── main.rs
  │       └── lib.rs
  ├── src/             # Frontend
  │   ├── index.html
  │   ├── styles/
  │   │   ├── app.css        # GitHub-style light theme
  │   │   └── app-dark.css   # Dark theme
  │   └── js/
  │       ├── editor.js      # CodeMirror init + config
  │       ├── preview.js     # Markdown → HTML rendering
  │       └── bridge.js      # Tauri invoke wrappers
  ├── package.json
  └── vite.config.js
  ```

### Step 0.2 — Dependencies
- **Rust crates**: `tauri`, `serde`, `serde_json`, `tauri-plugin-dialog`, `tauri-plugin-fs`, `tauri-plugin-shell` (for opening links)
- **JS**: `codemirror`, `@codemirror/lang-markdown`, `@codemirror/theme-one-dark`, `marked` (or `markdown-it`), `highlight.js`

### Step 0.3 — Dev workflow
- `cargo tauri dev` — hot-reload frontend + Rust backend
- `cargo tauri build` — produce platform binary (~5MB)

---

## Phase 1: Core Editor & Preview

### Step 1.1 — Window shell (Tauri config)
- `tauri.conf.json`: window title "med", size 1200×800, center
- Decorations: `false` (frameless from the start)
- Set transparent background for rounded corners

### Step 1.2 — Split-screen layout (HTML/CSS)
- CSS Grid or Flexbox: two columns, 50/50
- Left: `<div id="editor">` containing CodeMirror
- Right: `<div id="preview">` for rendered HTML
- Resizable divider between them (CSS or JS drag handle)

### Step 1.3 — Editor (CodeMirror 6)
- Initialize CodeMirror with Markdown language support
- Configure: line wrapping, tab size, monospace font (Menlo/JetBrains Mono)
- Listen for `change` events → trigger preview update

### Step 1.4 — Live rendering (JS)
- On editor change (debounced 150ms), pipe text through `marked.parse()`
- Inject syntax highlighting via `highlight.js` for fenced code blocks
- Set `preview.innerHTML = renderedHTML`

### Step 1.5 — Synchronised scrolling
- On editor scroll, compute scroll ratio
- Apply same ratio to preview `scrollTop`
- Guard against feedback loops with a `_syncing` flag

### Step 1.6 — Preview CSS (GitHub theme)
- Port the GitHub-style `preview.css` to the Tauri frontend
- Light + dark variants via CSS custom properties or class toggle

---

## Phase 2: Layout Modes

### Step 2.1 — Mode state
- JS state: `mode = "split" | "preview" | "editor"`
- CSS classes: `.mode-split`, `.mode-preview-only`, `.mode-editor-only`
- Toggle editor/preview visibility via CSS `display`

### Step 2.2 — View menu (Rust)
- Register Tauri menu items: "Split View", "Preview Only", "Focus Mode"
- Menu click → emit event to frontend → toggle mode
- Keyboard shortcuts: `Cmd+1`, `Cmd+2`, `Cmd+3`

---

## Phase 3: File System Integration

### Step 3.1 — Rust commands (file I/O)
```rust
#[tauri::command]
fn open_file(path: String) -> Result<String, String> { ... }

#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> { ... }
```

### Step 3.2 — Native dialogs
- Use `tauri-plugin-dialog` for Open/Save file dialogs
- Filter: `*.md`, `*.markdown`
- Open dialog → read file via Rust → send content to frontend
- Save dialog → get content from frontend → write via Rust

### Step 3.3 — Title bar & dirty state
- Window title set via Tauri API: `"filename.md — med"` or `"• filename.md — med"`
- Track dirty flag in frontend state
- Update title on every keystroke

### Step 3.4 — Unsaved changes guard
- Before New/Open/Quit: if dirty, show confirm dialog via `tauri-plugin-dialog`
- Handle window close event in Rust: `on_window_event(CloseRequested)`

---

## Phase 4: Toolbar

### Step 4.1 — Toolbar HTML/CSS
- Fixed bar at top: `<div id="toolbar">`
- Buttons: B (bold), I (italic), H (heading), ≡ (list), ⛓ (link), </> (code)
- Toggle visibility via View menu

### Step 4.2 — Formatting logic (JS)
- Each button inserts/wraps Markdown syntax at cursor position in CodeMirror
- CodeMirror API: `editor.dispatch(editor.state.replaceSelection(...))`
- Bold: wrap with `**`, Italic: `*`, Heading: toggle `#`, etc.

---

## Phase 5: Frameless Chrome & Theming

### Step 5.1 — Frameless window (Tauri config)
- `"decorations": false` in tauri.conf.json
- Custom traffic lights via HTML/CSS (red/yellow/green circles, top-left)
- CSS: `-webkit-app-region: drag` on the top bar area

### Step 5.2 — Window drag (JS)
- Traffic light buttons: `onclick` → Tauri `appWindow.close()` / `minimize()` / `toggleMaximize()`
- Title bar drag: handled by `-webkit-app-region: drag` CSS property

### Step 5.3 — Edge resize
- CSS `resize: both` or JS mouse event detection at edges
- Tauri `appWindow.startResize()` for system-level edge resize

### Step 5.4 — Rounded corners
- CSS `border-radius: 10px` on the root `<html>` element
- Tauri `"transparent": true` for window background

### Step 5.5 — Light/dark themes
- CSS custom properties: `--bg`, `--text`, `--code-bg`, etc.
- Toggle via View menu or OS preference (`prefers-color-scheme`)
- Re-render preview + update CodeMirror theme on switch

### Step 5.6 — Typography settings
- Preferences dialog (HTML modal or Tauri native dialog)
- Editor font: font-family + size for CodeMirror
- Preview font: font-family + size injected into preview wrapper

---

## Phase 6: Settings Persistence

### Step 6.1 — Settings struct (Rust)
```rust
#[derive(Serialize, Deserialize)]
struct Settings {
    theme: String,          // "light" | "dark"
    editor_font: String,    // "Menlo"
    editor_size: u32,       // 13
    preview_font: String,   // "system-ui"
    preview_size: u32,      // 16
    window_geometry: ...,   // x, y, w, h
}
```

### Step 6.2 — Persistence
- Save to `~/.config/med/settings.json` (or platform equivalent)
- Load on startup via Rust → send to frontend
- Save on change / close

---

## Phase 7: Polish & Distribution

### Step 7.1 — Cmd+W close
- Register `Cmd/Ctrl+W` keyboard shortcut in Tauri
- Same unsaved-changes guard as Quit

### Step 7.2 — Status bar
- Optional word/character count footer, same toggle pattern
- Hidden by default

### Step 7.3 — Logo / icon
- Bundle `icons/med.png` → convert to `.icns` / `.ico`
- Set in `tauri.conf.json` under `"icon"`

### Step 7.4 — CLI file arg
- Rust `main.rs`: read `std::env::args()` for file path
- Pass to frontend on startup

### Step 7.5 — Build & distribution
- `cargo tauri build` → produces:
  - macOS: `med.app` (~5MB)
  - Windows: `med.exe` (~5MB)
  - Linux: AppImage / .deb (~5MB)
- Optional: GitHub Actions CI for all platforms

---

## Execution Order

| Phase | What | Depends on |
|-------|------|------------|
| 0 | Scaffolding | — |
| 1 | Editor & Preview | Phase 0 |
| 2 | Layout Modes | Phase 1 |
| 3 | File System | Phase 1 |
| 4 | Toolbar | Phase 1 |
| 5 | Chrome & Theming | Phase 4 |
| 6 | Settings | Phase 5 |
| 7 | Polish & Build | Phase 6 |

Phases 2, 3, and 4 can run in parallel after Phase 1.
