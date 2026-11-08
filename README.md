# capture-inbox

**Windows CLI tool for ShareX → Obsidian screenshot capture workflow**

## Overview

Capture screenshots from ShareX directly into Obsidian markdown cards with two capture modes:

- **CREATE** (Ctrl+PrintScreen): Start a new capture card
- **APPEND** (Ctrl+Shift+PrintScreen): Add more screenshots to the current card

Perfect for preserving discussion fragments, troubleshooting sessions, or multi-step processes where screenshots belong together.

## Features

✅ **Two Capture Actions**:
- `--action create`: Creates new card, sets it as current target
- `--action append`: Adds screenshot to current card, preserves user edits

✅ **Implemented**:
- Accepts screenshot path from ShareX after-capture action
- Copies screenshot to Obsidian vault inbox (preserves exact bytes)
- Creates/updates Markdown cards with embedded images
- Opens card in Obsidian via URI protocol
- Collision-safe timestamp-based filenames
- Target isolation per vault/inbox combination
- State management with explicit target tracking
- Path validation and security
- Comprehensive error handling

❌ **NOT Implemented** (future milestones):
- OCR text recognition (placeholder shown in cards)
- AI-powered summarization (placeholder shown in cards)
- AI provider integration (no API keys or costs)

**No billing, deployments, credentials, or AI APIs required.**

---

## Quick Start

### Installation

```bash
# Install from repository
git clone https://github.com/robertCho/capture-inbox.git
cd capture-inbox
npm ci
npm run build
```

### Basic Usage

```bash
# Create new card (default action)
node bin/capture-inbox.js "/path/to/screenshot.png" --vault-path "/path/to/vault"

# Append to current card
node bin/capture-inbox.js "/path/to/screenshot.png" --vault-path "/path/to/vault" --action append
```

---

## ShareX Integration

### Two-Hotkey Setup (Recommended)

Configure two independent hotkeys in ShareX for maximum flexibility:

**Hotkey 1: Create New Card** (e.g., **Ctrl+PrintScreen**)
- Opens a new capture card
- Sets it as the current target for appends

**Hotkey 2: Append to Current Card** (e.g., **Ctrl+Shift+PrintScreen**)
- Adds screenshot to the current card
- Preserves user edits
- Opens the same card in Obsidian

### Configuration Steps

#### 1. Open ShareX Actions

- Right-click ShareX tray icon → **Task settings**
- Go to **Actions** tab

#### 2. Add First Action (Create)

Click **Add** and configure:

| Field | Value |
|-------|-------|
| **Name** | `Capture to Obsidian - Create` |
| **File path** | `C:\Program Files\nodejs\node.exe` |
| **Arguments** | `"C:\<PROJECT_ROOT>\bin\capture-inbox.js" "$input" --vault-path "C:\<YOUR_VAULT_PATH>"` |
| **Hidden window** | ☑ Checked |

**Example Arguments**:
```
"C:\Users\YourName\projects\capture-inbox\bin\capture-inbox.js" "$input" --vault-path "C:\Users\YourName\Documents\ObsidianVault"
```

#### 3. Add Second Action (Append)

Click **Add** again and configure:

| Field | Value |
|-------|-------|
| **Name** | `Capture to Obsidian - Append` |
| **File path** | `C:\Program Files\nodejs\node.exe` |
| **Arguments** | `"C:\<PROJECT_ROOT>\bin\capture-inbox.js" "$input" --vault-path "C:\<YOUR_VAULT_PATH>" --action append` |
| **Hidden window** | ☑ Checked |

**Example Arguments**:
```
"C:\Users\YourName\projects\capture-inbox\bin\capture-inbox.js" "$input" --vault-path "C:\Users\YourName\Documents\ObsidianVault" --action append
```

#### 4. Create Two Capture Profiles

ShareX → **Hotkey settings**:

**⚠️ IMPORTANT: Each hotkey must run ONLY ONE action**
- Do NOT check both actions for a single hotkey
- Each hotkey should execute create OR append, never both
- This ensures only one command runs per capture

**Profile 1: Create New Card**
- **Hotkey**: `Ctrl+PrintScreen` (or your preference)
- **Task**: Screen capture → Region (or any capture mode)
- **After capture tasks**:
  - ☑ Save image to file
  - ☑ Perform actions
- **Actions**: Select **ONLY** "Capture to Obsidian - Create" (uncheck any other actions)

**Profile 2: Append to Current Card**
- **Hotkey**: `Ctrl+Shift+PrintScreen` (or your preference)
- **Task**: Screen capture → Region (or any capture mode)
- **After capture tasks**:
  - ☑ Save image to file
  - ☑ Perform actions
- **Actions**: Select **ONLY** "Capture to Obsidian - Append" (uncheck any other actions)

#### 5. Verify node.exe Path

Find your Node.js installation:
```cmd
where node
```
Copy the first result (e.g., `C:\Program Files\nodejs\node.exe`)

### Important ShareX Notes

- **Use `$input` placeholder**: This is the captured screenshot file path
- **Do NOT use `$output`**: That's for different ShareX features
- **Quote paths with spaces**: Both the JavaScript file and vault path
- **Keep Windows Snipping Tool**: Plain `PrintScreen` can still work normally
- **User chooses hotkeys**: The examples above are suggestions, not requirements

---

## State Management

### How Target Tracking Works

The tool maintains state in:
```
<vault>/<inbox>/.capture-inbox-state/current-target.json
```

**State File Structure**:
```json
{
  "version": "1.0.0",
  "currentTarget": {
    "cardPath": "<vault>/<inbox>/capture_2026-11-08_14-23-45.md",
    "imagePath": "<vault>/<inbox>/capture_2026-11-08_14-23-45.png",
    "timestamp": "2026-11-08T14:23:45.123Z",
    "vault": "<vault-path>",
    "inbox": "<inbox-subdir>"
  }
}
```

### Target Isolation

- **Per vault/inbox combination**: Different vaults or inbox subdirectories have independent targets
- **Explicit state**: Target is set by successful `--action create`, not by file modification time
- **Validation on append**: Checks that target card exists and is within vault boundaries

### Resetting Target

Delete the state file to reset:
```bash
rm "<vault>/<inbox>/.capture-inbox-state/current-target.json"
```

Or simply create a new card with `--action create`.

### User-Visible Target Indication

**Important**: When used from ShareX with hidden window enabled, stdout is not visible to the user.

**Target Indication Methods**:

1. **Obsidian Auto-Open** (Primary Method):
   - Both create and append open the target card in Obsidian by default
   - Append opens the **same card** as the previous create
   - Visual confirmation: The card you see in Obsidian is the current target

2. **CLI Output** (Manual Testing Only):
   - CLI prints target card path when run manually
   - Example: `Card saved: <path>/capture_2026-11-08_14-23-45.md`
   - **Not visible** when run from ShareX with hidden window

3. **State File** (Advanced):
   - Check `<vault>/<inbox>/.capture-inbox-state/current-target.json`
   - Contains current target card path
   - Can be inspected manually if needed

**Limitations**:
- No visual indicator on screen during ShareX capture (by design, for clean workflow)
- No notification bubble or popup (would interrupt user workflow)
- Reliance on Obsidian auto-open for target awareness
- If Obsidian URI fails to open, user may not know which card was targeted

**Recommended Workflow**:
1. Press create hotkey → Obsidian opens new card → This is your current target
2. Press append hotkey → Obsidian opens same card → Screenshot added
3. Visual confirmation via Obsidian window is the primary feedback mechanism

---

## Command-Line Reference

### Synopsis

```
capture-inbox <screenshot-path> --vault-path <path> [options]
```

### Arguments

- `<screenshot-path>` (required): Absolute path to the screenshot file

### Options

- `--vault-path <path>` (required): Absolute path to Obsidian vault
- `--action <type>` (optional): Action type: `create` or `append` (default: `create`)
- `--inbox-subdir <path>` (optional): Subdirectory within vault (default: `inbox`)
- `--skip-open` (optional): Don't open Obsidian after capture
- `--help`: Show help message

### Actions

#### create (default)

Creates a new capture card and sets it as the current target.

**Behavior**:
- Copies screenshot to vault inbox
- Generates unique timestamp-based filenames
- Creates new Markdown card
- Stores card as current target for future appends
- Opens card in Obsidian (unless `--skip-open`)

**Compatible with**: Existing ShareX configurations (default action)

#### append

Appends screenshot to the current target card.

**Behavior**:
- Validates that a target card exists
- Copies screenshot to vault inbox with unique filename
- Appends image reference to existing card (before OCR section)
- Preserves user edits in the card
- Opens the same card in Obsidian (unless `--skip-open`)

**Fails if**:
- No target card exists (error: `NO_TARGET`)
- Target card was deleted or moved (error: `TARGET_MISSING`)
- Target is in a different vault/inbox

### Examples

```bash
# Create new card (explicit)
capture-inbox "C:\Screenshots\shot.png" --vault-path "C:\Vault" --action create

# Create new card (implicit, default action)
capture-inbox "C:\Screenshots\shot.png" --vault-path "C:\Vault"

# Append to current card
capture-inbox "C:\Screenshots\shot.png" --vault-path "C:\Vault" --action append

# Create without opening Obsidian
capture-inbox screenshot.png --vault-path "./vault" --skip-open

# Custom inbox subdirectory
capture-inbox screenshot.png --vault-path "./vault" --inbox-subdir "daily/captures"

# Append to custom inbox
capture-inbox screenshot.png --vault-path "./vault" --inbox-subdir "daily/captures" --action append
```

---

## Error Handling

### Common Errors

**NO_TARGET**: No current target card exists
- **Solution**: Create a new card first with `--action create`

**TARGET_MISSING**: Current target card was deleted or moved
- **Solution**: Create a new card with `--action create`

**FILE_NOT_FOUND**: Screenshot file doesn't exist
- **Solution**: Check the file path is correct

**VAULT_NOT_FOUND**: Vault directory doesn't exist
- **Solution**: Create the vault directory or check the path

**RELATIVE_PATH**: Path must be absolute
- **Solution**: Use full paths like `C:\Users\...` or `/home/user/...`

**PATH_ESCAPE**: Path attempts to escape vault
- **Solution**: Check `--inbox-subdir` setting doesn't use `..`

---

## Card Format

### New Card (Created with --action create)

```markdown
---
created: 2026-11-08T14:23:45.123Z
tags: [capture, inbox]
---

# Capture 2026-11-08

![Screenshot](capture_2026-11-08_14-23-45.png)

## OCR Text
*Not yet implemented*

## AI Summary
*Not yet implemented*
```

### After Append (--action append)

```markdown
---
created: 2026-11-08T14:23:45.123Z
tags: [capture, inbox]
---

# Capture 2026-11-08

![Screenshot](capture_2026-11-08_14-23-45.png)

![Screenshot](capture_2026-11-08_14-23-47.png)

![Screenshot](capture_2026-11-08_14-23-49.png)

## OCR Text
*Not yet implemented*

## AI Summary
*Not yet implemented*
```

### Preserving User Edits

The append action preserves any edits you make to the card:

```markdown
---
created: 2026-11-08T14:23:45.123Z
tags: [capture, inbox, bug-investigation]
---

# Bug Investigation - Login Issue

User reported login fails on Safari.

![Screenshot](capture_2026-11-08_14-23-45.png)

**Finding**: Console shows CORS error
<!-- User added these notes after first screenshot -->

![Screenshot](capture_2026-11-08_14-23-47.png)

**Solution**: Added missing header
<!-- Append added this second screenshot, preserved user notes -->

## OCR Text
*Not yet implemented*

## AI Summary
*Not yet implemented*
```

---

## Testing

### Run Automated Tests

```bash
npm test
```

**Coverage**: 75 tests, ~97% code coverage, 6 test suites

**Test Inventory**:
- **Original tests (31)**: All retained, no coverage weakened
  - Capture suite: 13 tests (file creation, collision, paths, errors)
  - Utils suite: 18 tests (path validation, encoding, filename generation)
- **New tests (44)**:
  - Append suite: 14 tests (multiple appends, user edits, target isolation)
  - State management: 14 tests (target tracking, validation, corruption handling)
  - Concurrent operations: 8 tests (concurrent creates/appends, lost update prevention)
  - Lock mechanism: 8 tests (serialization, stale lock cleanup, timeout behavior)

**Test Categories**:
- Create action: File creation, collision handling, path validation
- Append action: Multiple appends, user edit preservation, target isolation
- Concurrent operations: Parallel creates/appends, no lost updates, proper serialization
- State management: Target tracking, validation, error cases
- Lock mechanism: Acquire/release, stale detection, timeout, independent per-inbox
- Unicode/spaces: Chinese filenames, paths with spaces
- Error scenarios: Missing files, invalid paths, no target

### Manual Smoke Test

```bash
# Create test vault
mkdir -p test-vault/inbox

# Create first card
node bin/capture-inbox.js "./fixtures/test-image.png" --vault-path "./test-vault" --skip-open

# Append to card
node bin/capture-inbox.js "./fixtures/test-image.png" --vault-path "./test-vault" --action append --skip-open

# Verify card has 2 images
cat test-vault/inbox/*.md

# Clean up
rm -rf test-vault
```

---

## Security & Design

### Path Validation

- **Absolute paths required**: All paths must be absolute (rejects relative paths)
- **Vault boundary enforcement**: Inbox must be within vault (prevents directory traversal)
- **Target validation**: Checks vault boundaries on every append
- **Symlink handling**: Follows symlinks but validates final resolved path is within vault
- **Path traversal prevention**: Rejects `..` and other escape attempts

### Collision Handling

- Timestamp-based filenames: `capture_YYYY-MM-DD_HH-MM-SS.ext`
- Counter suffix on collision: `capture_YYYY-MM-DD_HH-MM-SS_1.ext`
- Unique filenames guaranteed per vault/inbox
- Safe for rapid sequential captures

### Concurrency & Locking

**✅ Robust Concurrent Operation Protection**

- **File-based locking**: All create and append operations are serialized per inbox
- **No lost updates**: Concurrent appends to the same card are fully safe
  - Lock acquired before read-modify-write
  - All appended images preserved, no silent data loss
  - User edits always preserved
- **Stale lock cleanup**: Locks older than 30 seconds automatically removed
- **Lock timeout**: Operations fail with clear error after 60 seconds if lock stuck
- **Independent locks**: Each vault/inbox has its own lock (parallel operation across inboxes)
- **Tested**: Comprehensive synthetic tests for concurrent creates, appends, and mixed operations

**ShareX Rapid Capture Support**:
- Multiple hotkey presses in quick succession are fully safe
- Create and append can be fired concurrently without data loss
- Operations are serialized automatically using file locks

### State Integrity

- State file written atomically (temp file + rename)
- Corrupted state file handled gracefully (returns empty state)
- Version checking (future compatibility)
- Lock-protected read-modify-write cycles prevent stale state

---

## Limitations & Known Issues

### Current Version

1. **No OCR**: Text in screenshots is not extracted
2. **No AI Summary**: No automatic summarization
3. **No rollback UI**: Cannot undo append via CLI (manual file editing required)
4. **Single target per vault/inbox**: Only one "current" card per inbox
5. **Target indication**: Relies on Obsidian auto-open (no screen notification)
6. **Lock timeout**: Operations fail after 60s if lock acquisition times out (rare)

### Windows Testing

- Core functionality tested on Linux with synthetic data
- Windows-specific path handling tested via automated tests
- ShareX integration requires manual Windows verification
- Obsidian URI opening is platform-dependent

### Not Implemented (By Design)

- GUI interface
- AI/OCR/provider integration
- Session collection/grouping
- Clipboard reading
- Auto-grouping heuristics
- Rollback/undo UI
- Changes to user's laptop configuration

---

## Troubleshooting

### ShareX action doesn't run

- Check "Perform actions" is enabled in After capture tasks
- Check "Save image to file" is also enabled (required)
- Temporarily uncheck "Hidden window" to see error messages
- Verify `node.exe` path with `where node`
- Test the exact command in Command Prompt manually

### "npm is not recognized"

- Node.js not installed or not in PATH
- Reinstall Node.js with "Add to PATH" option checked

### Obsidian doesn't open

- Test manually: Open browser, navigate to `obsidian://open?vault=<vault-name>`
- If that fails, URI protocol not registered (reinstall Obsidian)
- Tool reports "URI launched" but cannot verify Obsidian responded

### Append fails with NO_TARGET

- Create a new card first with `--action create`
- Or without `--action` (create is default)

### Images not visible in Obsidian

- Check image file exists in vault inbox
- Check image path in Markdown is relative (no `\` or `/` prefix)
- Check image filename matches exactly (case-sensitive)

---

## Development

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

### Run Tests with Coverage

```bash
npm test
```

### Project Structure

```
capture-inbox/
├── src/
│   ├── capture.ts          # Core capture logic (create/append)
│   ├── cli.ts              # Command-line interface
│   ├── state.ts            # State management (target tracking)
│   ├── types.ts            # TypeScript interfaces
│   ├── utils.ts            # Utilities (path validation, etc.)
│   └── tests/
│       ├── capture.test.ts # Capture tests (create action)
│       ├── append.test.ts  # Append action tests
│       ├── state.test.ts   # State management tests
│       └── utils.test.ts   # Utility tests
├── fixtures/               # Test fixtures (synthetic images)
├── bin/
│   └── capture-inbox.js    # CLI entry point
└── dist/                   # Compiled JavaScript (gitignored)
```

---

## Contributing

This project is in active development. For issues, feature requests, or contributions, please open an issue or pull request on GitHub.

---

## License

See LICENSE file in repository.

---

## References

- **ShareX**: https://getsharex.com/
- **ShareX Actions Documentation**: https://getsharex.com/actions
- **Obsidian**: https://obsidian.md/
- **Node.js**: https://nodejs.org/

---

*Version: 0.2.0 with append functionality*
