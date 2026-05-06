# Markdown Go

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**English** | [简体中文](./README.zh-CN.md)

A WYSIWYG Markdown editor for VS Code, designed for users who don't want to learn Markdown syntax. What you see is exactly what you get — no `#`, `*`, or `>` symbols on screen.

> Actively developed. Feedback and PRs are welcome.

## Features

### Editing experience

- 🎯 **WYSIWYG** — Rendered output is shown directly; raw Markdown symbols are hidden
- ➕ **Line-start `+` button** — One-click insert for headings (H1–H6, H4–H6 inside a submenu), paragraph, lists, blockquote, code block, divider, LaTeX, Mermaid, image, video
- ⌨️ **Slash menu** — Type `/` to open the insert menu with fuzzy search (e.g. `/h5`, `/mermaid`)
- 🫧 **Bubble menu** — Appears on selection: change block type, alignment, bold/italic/link, text color
- 📋 **Smart paste** — Detects Markdown text, rich text, and images automatically
- ↩️ **Ergonomic shortcuts** — Auto-continue lists on Enter, exit list on empty Enter, restore alignment / leave list on Backspace at line start

### Block rendering

- 🧮 **LaTeX** (KaTeX) — Block `$$ … $$`, double-click to edit source
- 📊 **Mermaid** — Live diagrams, double-click to toggle source mode
- 🖼️ **Images** — Local relative / absolute paths or remote URLs; `localResourceRoots` registered automatically
- 🎬 **Video / iframe** — Insert `<video>` and `<iframe>` via URL or local file picker
- 📐 **Block alignment** — Left / center / right for paragraphs, headings, images (serialized as `<div align="…">` for GitHub compatibility)
- 🎨 **Inline text color** — Serialized as `<span style="color:…">`

### Display modes

| Mode      | Description                                      |
| --------- | ------------------------------------------------ |
| `edit`    | WYSIWYG editing (default)                        |
| `preview` | Read-only preview; all editing controls hidden   |
| `plain`   | Show raw Markdown source                         |

### Integration

- 📁 **Explorer right-click** — "Open with Markdown Go"
- 🪟 **Editor title / context menu** — Same entry point
- ⌨️ **Keybinding** `Ctrl+Shift+M` / `Cmd+Shift+M` (on Markdown files)
- 🌍 **English / Chinese UI** — Follows VS Code display language or switch manually

## Install & use

```bash
# Clone & build
npm install
npm run build

# Press F5 in VS Code to launch the Extension Development Host
```

Once any `.md` file is open:

- Run **Markdown Go: Open With Markdown Go** from the command palette (`Ctrl+Shift+P`)
- Or right-click in the explorer / editor tab and choose **Open with Markdown Go**
- Or press `Ctrl+Shift+M`

## Commands

| Command ID                   | Title                       | Description                                      |
| ---------------------------- | --------------------------- | ------------------------------------------------ |
| `markdownGo.openWith`        | Open With Markdown Go       | Open the current Markdown with this extension    |
| `markdownGo.switchMode`      | Switch Display Mode         | Cycle through edit / preview / plain             |
| `markdownGo.switchLanguage`  | Switch Language             | Toggle English / Chinese UI                      |

## Configuration

Configure under `markdownGo.*` in `settings.json`:

| Setting                        | Type                              | Default      | Description                                                  |
| ------------------------------ | --------------------------------- | ------------ | ------------------------------------------------------------ |
| `markdownGo.language`          | `"zh-cn" \| "en"`                 | `"en"`       | Editor UI language                                           |
| `markdownGo.defaultMode`       | `"edit" \| "preview" \| "plain"`  | `"edit"`     | Default display mode when opening a document                 |
| `markdownGo.slashTrigger`      | `string`                          | `"/"`        | Character that triggers the slash menu                       |
| `markdownGo.defaultCopyFormat` | `"markdown" \| "plain"`           | `"markdown"` | Default copy format                                          |
| `markdownGo.keybindings`       | `object`                          | `{}`         | Override editor keybindings (command ID → chord or array)    |

Supported `markdownGo.keybindings` command IDs:

- `editor.undo` / `editor.redo`
- `editor.enter` / `editor.softLineBreak`
- `editor.backspaceAtStart`
- `editor.indent` / `editor.outdent`

Modifiers: `Ctrl` / `Cmd` / `Shift` / `Alt`, plus cross-platform `Mod` (Mac → Cmd, others → Ctrl). Use `""` to unbind a default. Example:

```json
"markdownGo.keybindings": {
  "editor.indent": "Tab",
  "editor.redo": ["Mod+Y", "Mod+Shift+Z"]
}
```

## Project structure

```
markdown-go/
├── src/                    # Extension side
│   ├── extension.ts        # Entry & command registration
│   └── editorProvider/     # Custom editor provider
├── webview/                # Webview side (Tiptap editor)
│   ├── index.ts            # Entry
│   ├── core/               # Bridge & command registry
│   ├── tiptap/             # Tiptap nodes / extensions / menus / Markdown serialization
│   ├── ui/                 # Dialogs and other UI
│   ├── runtime/            # Runtime helpers (image resolution, etc.)
│   ├── i18n/               # Webview i18n
│   └── styles/             # Stylesheets
├── shared/                 # Shared types between extension & webview
├── scripts/                # Build scripts (esbuild)
├── assets/                 # Static assets
└── agent_docs/             # Design / requirements / task docs
```

## Tech stack

- **TypeScript** + **VS Code Extension API**
- **esbuild** — bundler
- **Tiptap 2 / ProseMirror** — editor core (schema, cross-block selection, undo/redo)
- **prosemirror-markdown** + **markdown-it (commonmark)** — Markdown ↔ ProseMirror round-trip
- **KaTeX** — LaTeX rendering
- **Mermaid** — diagram rendering

## Development

```bash
npm install            # install dependencies
npm run build          # one-shot build
npm run watch          # incremental watch build
npm run typecheck      # type-check both extension & webview projects
# Press F5 to launch the Extension Development Host
```

## Reference projects

This project draws inspiration from these excellent VS Code Markdown extensions:

- [Markdown All in One](https://github.com/yzhang-gh/vscode-markdown)
- [Markdown Preview Mermaid Support](https://github.com/mjbvz/vscode-markdown-mermaid)
- [LaTeX (vscode-latex)](https://github.com/mathematic-inc/vscode-latex)
- [Markdown+Math (mdmath)](https://github.com/goessner/mdmath)

## License

Released under the [MIT License](./LICENSE).
