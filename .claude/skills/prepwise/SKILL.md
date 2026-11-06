---
name: prepwise
description: How the Prepwise interview notebook works and the rules for changing it safely. Use for any work in this repo, including features, UI or UX changes, doc chat, whiteboard export, storage, testing the app in a browser, and committing or pushing.
---

# Prepwise app guide

Prepwise is a local interview notebook built with React 19, TypeScript and Vite 6. `README.md` lists the user-facing features. This file covers what the code doesn't make obvious.

## Safety rules

- **Real data is one browser away.** Workspace data lives in IndexedDB per browser origin and is mirrored to `documents/`. A fresh browser on `127.0.0.1:5173` has an empty workspace that could overwrite the real files, so only use read-only `curl` against that port.
- **Test servers need their own data folder.** Always set `PREPWISE_DATA_DIR`, and use another port with `--strictPort`:
  `PREPWISE_DATA_DIR=<scratch> PREPWISE_CLAUDE_BIN=<stand-in> npx vite --port 5199 --host 127.0.0.1 --strictPort`
- **Run dev servers from this folder only.** A server in a copy that shares `node_modules` overwrites the Vite cache and gives `5173` 504 errors. If that happens, `touch vite.config.ts` recovers it.
- **Never publish** `notes/`, `documents/`, `.prepwise/` or `.env.local`. Before pushing, check the staged files for these paths and for secrets.
- **Never print or ask for the GitHub token.** It stays server-side in `.env.local`, and `.env.example` holds placeholders only.
- **Only commit or push when asked.** App code goes to `github.com/OneDay-zzz/prepwise`, which is public. Knowledge-base checkpoints go to a separate private repo.

## Checks

- `npm test` runs the Node tests in `tests/`.
- `npm run build` type-checks and builds.
- UI changes also need a real browser run on an isolated server, because the tests don't cover layout or CSS. Puppeteer with Chrome works. Check light, dark, a 400px phone, and two documents side by side.

## Storage

- Workspace data is in IndexedDB through `idb-keyval`. Layout is in localStorage under `prepwise-layout` (`src/layout-settings.ts`).
- `server/checkpoint-plugin.mjs` is the Vite server plugin. Its routes pass `isLocalRequest`, which needs a matching Origin, the header `X-Prepwise-Checkpoint: 1`, and a JSON content type.
- `server/workspace-files.mjs` writes docs to `documents/`. These files are generated. Editing one directly doesn't change the app, and the next checkpoint replaces it.

## Workspaces and formats

- A workspace is a label, not a separate store: `Workspace.spaces`, `SectionConfig.space`, and `Plan.space`. No value means the original workspace (`DEFAULT_SPACE`). All of it saves, backs up, and checkpoints as one object, so the combined calendar needs no extra loading.
- **Keep old data valid.** Add new fields as optional, because existing saves and backups must pass `validateWorkspace` unchanged.
- **Keep original paths stable.** The original workspace's sections stay at the top of `documents/`, and every other workspace is one folder (`sectionDirectories` in `server/workspace-files.mjs`).
- A document's first tab is `Note.body` and `Note.scene`, so a document with no other tabs is stored as before. Other tabs are in `Note.tabs`, and `NotePane` shows the open one as a stand-in `Note` so every editor works on it unchanged. Files are `document - tab.ext`, and chat changes carry a `tabId`.
- `Note.format` is `text` or `table`, and no value means Markdown. A table's `body` is CSV. These save as `.txt` and `.csv` with no frontmatter, so pinned state and tags live only in the workspace data.

## Doc chat

Chat uses the user's Claude Code login by running `claude -p`. It doesn't use an API key.

- `server/doc-chat.mjs` builds a sandbox per thread at `<data>/.prepwise/chat/<sha256(thread)[:16]>`. It holds the docs as Markdown, plus uploads, `_plans.json` and `*.whiteboard.txt`, and is rebuilt for each message and deleted afterwards.
- **Sandbox rule:** `--allowedTools` must use path-scoped rules with `--permission-mode dontAsk`. A plain tool name allows any path on the machine. If you change these flags, re-test with a fake secret outside the sandbox.
- Changes are found by diffing the sandbox, then applied in the browser with conflict protection and per-card Undo (`src/doc-chat-model.ts`).
- A resumed session keeps its first system prompt. Anything that changes between messages, such as the date, current page, section names or mention limits, goes in the bracketed prefix on the message.
- Deleting a chat also removes its transcript from `~/.claude/projects/`.
- `src/DocChat.tsx` sets the panel's position from the host element, and uses an inline `paddingRight` because React rewrites `className`.
- Auto-scroll has to pause while text is being selected (the `selecting` and `pinned` refs). Selecting chat text while an answer streams is a regression to re-test.

## Whiteboard

`src/whiteboard-export.ts` and `src/Whiteboard.tsx` turn a selection into an SVG in the section's gallery and link it in the doc. Inside a folder the link is `../_gallery/`.

When scripting the board, keyboard shortcuts need focus inside it, and the style panel covers the left side once a tool is chosen. Chrome drags need a few settling mouse moves.

## UI rules

Stylesheets load in this order: `tokens.css`, `styles.css`, `organization.css`, `settings.css`, `dark.css`, `layout.css`, `refresh.css`.

- **Colors come from `src/tokens.css`.** Don't add hex values to components or selector-based dark overrides. Add or reuse a token, and both themes follow. The exceptions are the section tints (`.section-icon`, `.note-icon`) and overlays, whose dark values are in `dark.css`.
- **The accent marks one thing:** the current location or the primary action. Everything else is neutral. Status colors (danger, success, warning, info) only carry meaning.
- **`refresh.css` wins layout conflicts** because it loads last. Put layout changes there, not in the older per-breakpoint rules.
- **Keep documents first.** Don't add permanent rows above a document or in the sidebar. Rarely used actions belong behind an icon with an `aria-label` and `title`. All sidebar sections must fit at 1440x900 without scrolling.
- Top bar height comes from `--topbar`. Use the variable in any sticky or height calculation.

Check UI work in this order:

1. **Accessibility:** text contrast at least 4.5:1 (3:1 for large text) in both themes, visible focus rings, and a name on every icon-only button.
2. **Touch:** targets at least 44px under `@media(pointer:coarse)`, and nothing that only works on hover.
3. **Layout:** no horizontal page scroll at 400px, and no reserved space that jumps when content loads.
4. **Type:** interface text at least 12px, sized with `calc(Npx*var(--font-scale))`. Note text uses `--doc-font-scale`. Don't use `font-synthesis:none`, because it hides italics.
5. **Icons:** `lucide-react` SVGs, never emoji.
6. **Motion:** purposeful, and respects the `prefers-reduced-motion` rule in `styles.css`.
7. **Forms:** visible labels, and errors next to the field.
