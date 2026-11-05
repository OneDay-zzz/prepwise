# Prepwise — local interview knowledge workspace

A React + TypeScript interview notebook with embedded Excalidraw, local-folder access, and interview planning.

## Run locally

Use Node.js 22.18+ (Node 24 recommended).

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite in **desktop Chrome or Edge** for local-folder support. The rest of the workspace works in browsers that support IndexedDB. Folder access requires localhost or HTTPS and the browser's explicit folder permission.

```sh
npm test       # dependency-free data and local-file tests
npm run build # TypeScript checking and production build
```

## Features

- Resume upload (PDF, DOC/DOCX, TXT, Markdown; maximum 10 MB), download, and PDF preview. Uploads do not automatically parse or summarize a resume.
- Resume, behavioral, project deep-dive, LeetCode, company experience, and freeform reflection collections with guided templates.
- Company experiences include company, role/level, round, date, and source link, with a company filter.
- Each section has its own folders. Create/rename folders, move documents by dragging them onto a folder or using the Folder selector on the document, and delete folders without deleting their documents.
- Move or copy a document to another section with **Move or copy** on the document, where you can also choose a folder, or drag it from the list onto a section in the sidebar (hold Option/Alt while dropping to copy). A copy is independent and includes the whiteboard.
- Pin important documents to the top, bookmark documents to revisit, and add/remove tags. Filter by pinned/bookmarked/tag and search across titles, content, tags, and company details.
- Set a note's importance from 1 to 5, where 5 is the highest. Click the current level to clear it.
- Sort the document list by your own order, last updated, importance, title, length, or interview-ready status, plus interview date in company experiences. The arrow beside the selector reverses the order. Pinned documents stay on top, notes with no value for the chosen criterion stay last, and the choice is remembered per device.
- PDFs uploaded to a section's gallery also appear in its document list under **PDF FILES**, and in Search all. Clicking one reads it in the current window, using the browser's PDF viewer for pages, zoom, and search, so you can keep a PDF beside a note in two windows.
- Every section has a **Gallery** for uploading documents and images (up to 20 MB each), with thumbnails, open, download, and delete. Files are included in backups and checkpoints. A note's image link shows the gallery image with the same filename, whatever path the link uses, and the note's text stays unchanged.
- Add your own section with the **+** beside MY KNOWLEDGE in the sidebar.
- **Customize** (sidebar): adjust interface and note text size separately, and edit each section's title, tagline, description, icon, color, and note template. Reorder or hide sections, or add your own. Any section can be hidden, or deleted with the trash button after choosing where its notes go. A deleted built-in section can be brought back from the same list, with its original settings. Sections are saved with the workspace, backups, and checkpoints; text size is remembered per device.
- Collapse the sidebar to icons with the button at the top left, and hide the note list with the buttons at the top right. Those buttons also switch between one document, two side by side, and two stacked. In two windows, the highlighted window receives the note you click in the list, each window has its own Read/Write/Whiteboard view and a selector for any section's documents, and the bar between them resizes them. Drag a Read, Write, Split, or Whiteboard tab to an edge of the document area to show it on that side, or onto a window to show it there. Drag the edge of the sidebar or note list to change its width, and double-click the edge to reset it. The layout is remembered per device.
- Light/dark mode toggle in the top-right header, initially matching the system preference and then remembering your selection. Excalidraw follows the app theme.
- **Live** tab: a Typora-style editor powered by Milkdown, where formatting appears as you type. Saving rewrites the note's Markdown in a standard form, so editing there can tidy lines you didn't change, such as `*` bullets becoming `-` or `5 * 3` becoming `5 \* 3`. Both still display the same. Use Write to control the exact text. Cmd/Ctrl-click opens a link.
- **Table of contents**: a note with headings lists them beside its Read, Live, Write, and Split views. Click one to jump there; the highlight follows as you scroll. The list icon next to Export shows or hides it. Drag its left edge to resize it, or double-click the edge to reset. Both are remembered per device. It stays pinned beside the note while you scroll, including in two windows. Where there's no room beside it, as on a phone, it's pinned under the tabs. It isn't added to the note's text or exports.
- **Chat**: the speech-bubble icon next to the table-of-contents icon opens a chat with Claude beside a document. Each document keeps its own chats. **New chat** starts a fresh conversation without resending the old one, which uses fewer tokens, and the list beside it switches between them; several can answer at once. Deleting a chat removes its history from this browser and Claude Code's transcript of it on this computer; edits it already made stay. Arrow buttons in the chat, or Home and End while the messages are focused, jump to the top or bottom. The icon at the top right of every page opens a separate **Workspace chat** for everything: documents, uploaded files, the text on whiteboards, and your calendar and planner. It stays open as you move between pages, and it can add or change tasks, interviews, and milestones. Type `@` in a message, or use the **@** button, to pick documents, uploaded files, your resume, or your calendar. Claude then gets only those for that message, plus the open document in a document chat, so it spends no tokens searching or reading anything else. Each answer shows how many tokens it used, and a long chat suggests starting a new one. Choose Fable, Opus, Sonnet, or Haiku under the message box; the choice is remembered per device, can change mid-conversation, and each answer shows which model wrote it. Claude focuses on that document and can read the rest of the workspace. When you ask for a change, the edit goes straight into the workspace and the document's local file follows; each edit shows what changed, with **Undo**. A document or plan list you changed while Claude was working isn't overwritten unless you choose to. This needs [Claude Code](https://claude.com/claude-code) installed and signed in, uses your plan rather than an API key, and sends what Claude reads to Anthropic. Claude works on a temporary copy of the documents and is refused access to anything else on the computer, with no shell or web tools. Chats are stored in this browser and aren't included in backups or checkpoints.
- **Search all** (Cmd/Ctrl+K) finds a document in any section from the keyboard. Cmd/Ctrl+\\ collapses the sidebar. The note list and documents scroll independently, and a document's folder, importance, and tags sit under **Details**, which stays open or closed per device.
- **Split into documents** (under **Details**) turns a long note into one document per heading, with a preview first. Headings that only group others become folders, and the original note stays until you delete it. If the section already has a document with the same name, an empty one is filled, one that already has the text stays as it is, and one with different text is kept beside a new document.
- Drag documents up or down in the list to put them in your own order, or drag folders to reorder them. While you drag a document, the folders stay pinned at the top of the list, and the list scrolls when you drag near its top or bottom edge. Reordering a document switches the list to **My order** under **Sort by**, where new documents appear at the top and pinned ones stay above the rest. The order is saved with the workspace, in backups and checkpoints, and doesn't change a document's last-updated date. Dragging needs a mouse or trackpad.
- Cmd/Ctrl-click or Shift-click documents in the list to select several, then drag any of them onto a folder or a sidebar section to move them all (hold Option/Alt on a section to copy). Esc clears the selection.
- Each note reopens in the view you last used for it, even after a reload, and a note you haven't opened yet uses the view you used most recently. This is remembered per device.
- Moving, copying, splitting, or deleting a document offers **Undo** for a few seconds.
- Markdown editing, formatting controls, preview, split view, search within collections, and Markdown export.
- A real embedded Excalidraw editor for every note, including scene images stored with the drawing. Use the button at the top right of the board to expand it to full screen. **Add to doc**, beside it, saves a picture of the selected shapes, or the whole board if nothing is selected, as an SVG in the section's gallery and links it at the end of the document. The picture is a snapshot, so it doesn't change when you edit the board afterwards.
- Prep tasks and interview scheduling with company, round, date, local time, duration, details, and linked notes.
- **Milestones**: use **Add milestone** on the Calendar or Planner to set what you should finish by a date, with an optional time, details, and a linked note. Each one is flagged on the calendar, shows the days left or overdue, and stays in **Coming up next** until you tick it off. An overdue milestone turns red.
- Monthly calendar, completion tracking, and `.ics` export for saved plans.
- Automatic browser persistence using IndexedDB and complete JSON backup export/import.

## Work with a local folder

1. Click **Connect local folder** and select a folder in the browser picker.
2. Open a `.md` or `.excalidraw` file from the folder browser. Nested folders are included. Hidden directories, `node_modules`, `dist`, and `build` are skipped.
3. Edit the Markdown or switch to **Whiteboard** to draw with Excalidraw.
4. Click **Save to folder** to write the current note and drawing to disk.

Files with matching names in the same folder are paired automatically:

```text
interview-prep/
  resume/
    talking-points.md
  behavioral/
    ownership.md
  projects/
    payment-service.md
    payment-service.excalidraw
  leetcode/
    two-pointers.md
    two-pointers.excalidraw
```

A newly saved note creates a Markdown file in the selected root folder; a drawing creates a standard `.excalidraw` file with the same basename. An opened file is saved to its original path, even if its display title changes. Files opened from disk go into the current note collection, or Project deep dives when opened from the overview/planner.

The folder browser's refresh button refreshes the file list. Reopen a file to reload its content from disk. If a file changed externally after opening, saving stops with a conflict message; export your current work before reopening if you want to retain both versions. Existing unrelated files are never silently overwritten. Deleting a note in the app does **not** delete its source files on disk.

### Organize your documents

Use the folder-plus button under **Folders** in any section. New documents inherit the selected folder. Use the dropdown beside **Pin** and **Bookmark** to move an existing document. Folder names are unique within each section. Deleting a folder moves its documents to **Unfiled**.

Type a tag beside the tag icon and press Enter or comma; leaving the field also adds it. Tags are case-insensitively deduplicated. Use the document list filters to find pinned, bookmarked, or tagged notes.

These folders organize the browser workspace; the complete workspace JSON backup includes them. They are separate from disk directories chosen through **Connect local folder**, so organizing a document inside the app does not relocate its existing source file. Markdown export/local save carries tags, pin/bookmark state, and company metadata in explicitly marked YAML-compatible frontmatter. Ordinary Markdown without document labels is preserved as plain Markdown. Restore a full workspace backup to retain all in-app folders.

### Storage behavior

- Browser edits save automatically to IndexedDB. **Local file writes are explicit** via Save to folder.
- Folder permissions and note-to-file connections are session-scoped. After reloading, reconnect your folder and open a file again. The browser copy of your notes remains available.
- Tasks, interviews, uploaded resumes, and collection membership live in the browser workspace; the local-folder feature currently saves Markdown and drawings. **Export workspace** includes all data in a portable JSON backup, which can be saved into your folder using the browser download dialog and restored later.
- This is a single-user local app. It has no accounts, cloud sync, external calendar sync, background file watching, or reminder notifications.
- Calendar times use the device's timezone. `.ics` export converts scheduled times to UTC.
- Individual file writes use the browser's writable-file transaction. Saving a paired Markdown/drawing is not a multi-file atomic operation; a later failure can leave one successfully saved file. Error feedback and per-file baselines preserve safe retry behavior within the session.

## Development layout

- `src/App.tsx`: workspace UI, Markdown editor, persistence, uploads, and backups.
- `src/Whiteboard.tsx`: lazy-loaded Excalidraw integration.
- `src/LocalFolder.tsx`: folder browser, file editing connections, and save controls.
- `src/local-files.ts`: file pairing, format validation, and conflict-aware writes.
- `src/Planner.tsx`: interviews, study tasks, calendar, and iCalendar export.
- `src/model.ts`: data model, templates, backup validation, and calendar dates.
- `tests/workspace.test.mjs`: dependency-free tests using Node's built-in runner.

## Verification in the authoring environment

23 tests passed, along with TypeScript checking and the production build. Browser checks verified folder creation, new documents inheriting their folder, pins, bookmarks, tags, company metadata, theme switching, Excalidraw theme integration, and persistence after reload. Browser checks used a separate localhost origin from the existing 127.0.0.1 workspace.

API references: [File System Access](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker), [Excalidraw integration](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/installation).

## Local Markdown copies

While the app is open, every note, drawing, gallery file, and your resume are saved automatically as ordinary files in `documents/` in this project, about two seconds after each change, with the same layout as a checkpoint's `documents/` folder. Renaming, moving, or deleting a document in the app does the same to its file. Your uploads stay in the browser as well: these are copies.

The copy goes one way, from the app to the files. Editing a file doesn't change the app, and any later change in the app replaces it, even a change to another document, so the edited version is first set aside in `documents/.replaced/`. To have a document edited by AI, use its chat. Files you add to the folder yourself are left alone unless a document takes the same path, when they're set aside too.

The browser keeps a separate workspace for each address, such as `localhost` and `127.0.0.1`. The first address to save owns the folder. Another one is not saved there until you choose **Use this workspace** under **GitHub checkpoints**. Set `PREPWISE_DATA_DIR` to keep a test copy of the app away from these files.

## GitHub checkpoints

Copy `.env.example` to `.env.local`, set a private repository and a fine-grained token with **Contents: read and write**, and restart the app. Each checkpoint is one commit containing:

```text
workspace.json                       notes, plans, and settings; Restore starts from this file
documents/
  Project deep dives/
    payment-service.md
    payment-service.excalidraw
    Architecture/                    a folder you created in the app
      caching.md
    _gallery/                        files uploaded to this section's gallery
      system-diagram.png
  _resume/
    my-resume.pdf
```

`documents/` is generated: edits made there on GitHub are not restored (Restore only reads gallery files back from it) and are overwritten or removed by the next checkpoint, including files you add yourself. Other files in the repository are left alone. A checkpoint with no changes creates no commit.
