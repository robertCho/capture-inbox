# capture-inbox

**Windows CLI tool for ShareX → Obsidian screenshot capture workflow**

## Milestone 1 Scope

This is **Milestone 1 only**: Proves the screenshot → persisted Markdown card + image → Obsidian open workflow.

✅ **Implemented**:
- Accepts screenshot path from ShareX after-capture action
- Copies screenshot to Obsidian vault inbox (preserves exact bytes)
- Creates Markdown card with embedded image
- Opens card in Obsidian via URI protocol
- Collision-safe timestamp-based filenames
- Path validation and security
- Error handling

❌ **NOT Implemented** (future milestones):
- OCR text recognition (placeholder says "Not yet implemented")
- AI-powered summarization (placeholder says "Not yet implemented")
- AI provider integration (no API keys or costs)

**No billing, deployments, credentials, or AI APIs required for this milestone.**

---

## Windows Acceptance Testing Guide

This README is a **self-contained runbook** for Windows acceptance testing. All automated tests passed on Linux; Windows GUI and ShareX automation require manual verification.

**PR Branch**: https://github.com/robertCho/capture-inbox/pull/1  
**Branch**: `cursor/sharex-obsidian-cli-4003`  
**Latest Commit**: b38465d

---

## Prerequisites

### Required Software

1. **Windows** (primary target, tested on Linux only)
2. **Node.js** 18.0.0 or higher (LTS recommended)
   - Download: https://nodejs.org/
   - Verify: Open **Command Prompt** (not PowerShell) and run:
     ```cmd
     node --version
     ```
     Expected: `v18.0.0` or higher

3. **Obsidian** with an **empty test vault**
   - Download: https://obsidian.md/
   - **Important**: Create a NEW empty vault for testing (do not use your personal vault)
   - Vault must be created and opened at least once in Obsidian before URI testing

4. **ShareX** (optional, for end-to-end automation testing)
   - Download: https://getsharex.com/

### Test Environment Setup

1. **Create test vault**:
   - Open Obsidian
   - Create new vault: `C:\Users\<YourName>\Documents\test-vault-capture-inbox`
   - Open it once to ensure Obsidian registers it
   - Close Obsidian

2. **Note your paths** (you'll need these):
   - Node.js executable: Run `where node` in Command Prompt
   - Test vault path: The full path you just created

---

## Installation from PR Branch

**Download this specific PR branch** (not main):

### Option 1: Download ZIP (No Git Required)

1. Download: https://github.com/robertCho/capture-inbox/archive/refs/heads/cursor/sharex-obsidian-cli-4003.zip
2. Extract to a folder (e.g., `C:\Users\<YourName>\Downloads\capture-inbox-test`)
3. Open **Command Prompt** and navigate to the extracted folder:
   ```cmd
   cd C:\Users\<YourName>\Downloads\capture-inbox-test\capture-inbox-cursor-sharex-obsidian-cli-4003
   ```

### Option 2: Git Clone (If Git Installed)

```cmd
git clone https://github.com/robertCho/capture-inbox.git
cd capture-inbox
git checkout cursor/sharex-obsidian-cli-4003
```

### Verify You're in the Right Place

You should see `package.json` in your current directory:

```cmd
dir package.json
```

Expected: File exists

---

## Build and Install Dependencies

**All commands run in Command Prompt** (cmd.exe), not PowerShell (to avoid execution policy issues).

```cmd
REM Install dependencies (use exact lockfile)
npm.cmd ci

REM Build TypeScript to JavaScript
npm.cmd run build

REM Verify dist directory was created
dir dist
```

**Expected Output**:
- `npm ci`: Installs 3 packages, 0 vulnerabilities
- `npm run build`: TypeScript compilation successful
- `dist` folder contains: `capture.js`, `cli.js`, `utils.js`, `types.js`, and `tests\` subfolder

**Stop on Failure**: If any command fails, do not proceed. Report error output.

---

## Baseline Test: Manual CLI with Synthetic Fixture

Test with repository's included synthetic screenshot (NOT your personal screenshots).

### Step 1: Locate Synthetic Fixture

The repository includes `fixtures\test-image.png` (1x1 pixel synthetic PNG, 70 bytes).

Get its absolute path:

```cmd
cd fixtures
echo %CD%\test-image.png
cd ..
```

**Copy the full path** (e.g., `C:\Users\<YourName>\...\capture-inbox\fixtures\test-image.png`)

### Step 2: Run CLI with --skip-open (No Obsidian Launch)

Replace placeholders with YOUR actual paths:

```cmd
node bin\capture-inbox.js "C:\<PROJECT_ROOT>\fixtures\test-image.png" --vault-path "C:\<YOUR_TEST_VAULT_PATH>" --skip-open
```

**Placeholder Guide**:
- `<PROJECT_ROOT>`: Where you extracted/cloned capture-inbox
- `<YOUR_TEST_VAULT_PATH>`: Your test vault (e.g., `C:\Users\YourName\Documents\test-vault-capture-inbox`)

**Expected Output**:
```
✓ Capture successful
  Image saved: C:\<YOUR_TEST_VAULT_PATH>\inbox\capture_2026-11-07_XX-XX-XX.png
  Card saved: C:\<YOUR_TEST_VAULT_PATH>\inbox\capture_2026-11-07_XX-XX-XX.md
  Obsidian open: skipped
```

**Exit Code**: 0 (success)

**Verify**: Check your test vault's `inbox` folder - you should see:
- `capture_YYYY-MM-DD_HH-MM-SS.png` (70 bytes)
- `capture_YYYY-MM-DD_HH-MM-SS.md` (206 bytes)

**Stop on Failure**: If error occurs, read message carefully. Common errors:
- "Screenshot file not found": Check fixture path is absolute and correct
- "Vault directory not found": Check vault path exists and is absolute
- Exit code 1: Error occurred, do not proceed until resolved

### Step 3: Verify Image Integrity (SHA256)

**Command Prompt** (using certutil):

```cmd
cd C:\<YOUR_TEST_VAULT_PATH>\inbox
certutil -hashfile test-image.png SHA256
certutil -hashfile capture_2026-11-07_XX-XX-XX.png SHA256
```

**PowerShell** (alternative):

```powershell
Get-FileHash fixtures\test-image.png
Get-FileHash C:\<YOUR_TEST_VAULT_PATH>\inbox\capture_*.png
```

**Expected**: Both SHA256 hashes **must match exactly**:
```
SHA256 hash: 6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0
```

**Stop on Failure**: If hashes don't match, image was corrupted. Report immediately.

### Step 4: Inspect Generated Markdown Card

Open `capture_*.md` in a text editor (not Obsidian yet):

**Expected Content**:
```markdown
---
created: 2026-11-07T08:35:57.482Z
tags: [capture, inbox]
---

# Capture 2026-11-07

![Screenshot](capture_2026-11-07_08-35-5.png)

## OCR Text
*Not yet implemented*

## AI Summary
*Not yet implemented*
```

**Verify**:
- ✅ Frontmatter has `created` timestamp in ISO format
- ✅ Frontmatter has `tags: [capture, inbox]`
- ✅ Image embedded with **relative path** (filename only, no directory)
- ✅ OCR section says "*Not yet implemented*"
- ✅ AI Summary section says "*Not yet implemented*"

---

## Auto-Open Test: Obsidian URI Launch

**Prerequisites**:
- Obsidian must be installed
- Test vault must exist and have been opened in Obsidian at least once
- Obsidian can be closed during test

### Step 5: Test Obsidian URI Launch

Run WITHOUT `--skip-open` flag:

```cmd
node bin\capture-inbox.js "C:\<PROJECT_ROOT>\fixtures\test-image.png" --vault-path "C:\<YOUR_TEST_VAULT_PATH>"
```

**Expected Behavior**:
1. Command prints:
   ```
   ✓ Capture successful
     Image saved: ...
     Card saved: ...
     Obsidian open: URI launched (verify manually that Obsidian opened)
   ```
2. Command exits (does not hang)
3. Obsidian window **should** open showing the new card

**If Command Hangs**:
- Wait **up to 10 seconds**
- Press `Ctrl+C` to stop
- Report as failure: "URI launch hangs command"
- Note: Tool attempted launch but cannot verify success

**Manual Verification**:
- Did Obsidian open? (YES/NO)
- Did it show the new card? (YES/NO)
- Is the embedded image visible? (YES/NO)

**Distinction**:
- "URI launched" = Tool sent the command
- "Obsidian opened" = You see the Obsidian window
- These are different! Tool cannot detect if Obsidian responded.

**Stop on Failure**: If Obsidian doesn't open:
1. Test manually: Open browser, go to `obsidian://open?vault=test-vault-capture-inbox`
2. If that fails, Obsidian URI protocol is not registered
3. Reinstall Obsidian or check Windows URI registration

### Step 6: Verify Image Renders in Obsidian

With card open in Obsidian:

**Expected**:
- Markdown card displays
- Image shows inline (1x1 pixel, may appear tiny)
- Image is clickable/expandable
- No broken image icon

**Stop on Failure**: If image doesn't render:
- Check image file exists in vault/inbox
- Check image path in Markdown is relative (no `\` or `/` prefix)
- Check image filename matches exactly (case-sensitive on some systems)

---

## Collision Safety Test

### Step 7: Rapid Consecutive Captures

Run the command **3 times rapidly** (within same second if possible):

```cmd
node bin\capture-inbox.js "C:\<PROJECT_ROOT>\fixtures\test-image.png" --vault-path "C:\<YOUR_TEST_VAULT_PATH>" --skip-open

node bin\capture-inbox.js "C:\<PROJECT_ROOT>\fixtures\test-image.png" --vault-path "C:\<YOUR_TEST_VAULT_PATH>" --skip-open

node bin\capture-inbox.js "C:\<PROJECT_ROOT>\fixtures\test-image.png" --vault-path "C:\<YOUR_TEST_VAULT_PATH>" --skip-open
```

**Expected**:
- All 3 succeed (exit code 0)
- 6 files created: 3 PNG + 3 MD
- Filenames have collision counters: `capture_*_1.png`, `capture_*_2.png`, etc.
- OR different timestamps if captures were >1 second apart

**Verify**:

```cmd
dir C:\<YOUR_TEST_VAULT_PATH>\inbox
```

Count the files. You should have at least 6 files total (from all tests).

**Stop on Failure**: If any capture failed or files were overwritten (same timestamp, no counter), report collision handling bug.

---

## Unicode and Spaces Path Test

### Step 8: Test with Chinese Filename

The repository includes `fixtures\test-image-cn-文件.png` with Chinese characters.

```cmd
node bin\capture-inbox.js "C:\<PROJECT_ROOT>\fixtures\test-image-cn-文件.png" --vault-path "C:\<YOUR_TEST_VAULT_PATH>" --skip-open
```

**Expected**: Success, files created

**Verify**: Check vault/inbox for new capture (filename will be timestamp-based, not Chinese)

### Step 9: Test with Spaces in Vault Path

If your test vault path has spaces (e.g., `C:\Users\My Name\Documents\test vault`):

```cmd
node bin\capture-inbox.js "C:\<PROJECT_ROOT>\fixtures\test-image.png" --vault-path "C:\Users\My Name\Documents\test vault" --skip-open
```

**Expected**: Success (quotes handle spaces)

---

## Error Scenario Tests

### Step 10: Missing Screenshot File

```cmd
node bin\capture-inbox.js "C:\nonexistent\fake.png" --vault-path "C:\<YOUR_TEST_VAULT_PATH>" --skip-open
```

**Expected**:
- Exit code: 1
- Error message: `✗ Capture failed: Screenshot file not found`
- Helpful explanation printed

### Step 11: Missing Vault Directory

```cmd
node bin\capture-inbox.js "C:\<PROJECT_ROOT>\fixtures\test-image.png" --vault-path "C:\nonexistent\vault" --skip-open
```

**Expected**:
- Exit code: 1
- Error message: `✗ Capture failed: Vault directory not found`
- Instructions to create vault or check path

### Step 12: Relative Path Rejection

```cmd
node bin\capture-inbox.js "fixtures\test-image.png" --vault-path "C:\<YOUR_TEST_VAULT_PATH>" --skip-open
```

**Expected**:
- Exit code: 1
- Error message: `✗ Capture failed: Screenshot path must be an absolute path`
- Examples of correct absolute paths

---

## Help and Supported Flags

### Step 13: Verify Help Output

```cmd
node bin\capture-inbox.js --help
```

**Expected**: Usage instructions with all flags documented

**Supported Flags** (verified):
- `<screenshot-path>` (positional, required, absolute path)
- `--vault-path <path>` (required, absolute path)
- `--inbox-subdir <path>` (optional, default: "inbox")
- `--skip-open` (optional, boolean flag)
- `--help` (optional, shows help)

**No other flags supported.** Do not use undocumented flags.

---

## ShareX Integration (End-to-End Automation)

**Prerequisites**: ShareX installed, CLI tests passed

### Understanding ShareX Actions

ShareX has an **Actions** feature (not Custom Uploader) that runs programs after capturing screenshots.

**Official Documentation**: https://getsharex.com/actions

**Key Placeholder**:
- `$input` = Path to the captured screenshot file (**use this**)
- `$output` = Path to output file for conversion tools (not for us)

**Important**: Do NOT confuse with Custom Uploader placeholders (`%filepath`, etc.) - different feature.

### ShareX Configuration Steps

**Version Note**: These menu names are from ShareX as of Nov 2026. If your version differs, look for similar options.

1. **Open ShareX**

2. **Navigate to Task Settings**:
   - Right-click ShareX tray icon → **Task settings**
   - OR: Main window → **Task settings** button

3. **Add Action**:
   - Go to **Actions** tab
   - Click **Add** button

4. **Configure Action**:

   **Field Values** (replace `<placeholders>` with YOUR paths):

   | Field | Your Value |
   |-------|------------|
   | **Name** | `Capture to Obsidian` |
   | **File path** | `C:\Program Files\nodejs\node.exe` |
   | **Arguments** | `"C:\<PROJECT_ROOT>\bin\capture-inbox.js" "$input" --vault-path "C:\<YOUR_VAULT_PATH>"` |
   | **Output file name extension** | (leave empty) |
   | **Hidden window** | ☑ (checked - hides console) |
   | **Run with hidden window** | ☑ (checked if available) |

   **Finding `node.exe` path**:
   ```cmd
   where node
   ```
   Copy the first result (e.g., `C:\Program Files\nodejs\node.exe`)

   **Critical**: 
   - `node.exe` path is NOT quoted
   - JavaScript file path IS quoted
   - `"$input"` IS quoted (per official ShareX Actions examples)
   - Vault path IS quoted

   **Example Arguments**:
   ```
   "C:\Users\YourName\Downloads\capture-inbox\bin\capture-inbox.js" "$input" --vault-path "C:\Users\YourName\Documents\test-vault-capture-inbox"
   ```

5. **Enable the Action**:
   - In Actions list, ensure checkbox next to your action is **checked**
   - Click **OK**

6. **Enable "Perform actions" After-Capture Task**:
   - Main ShareX window → **After capture tasks** section
   - Find and check: **✓ Perform actions**
   - Ensure **✓ Save image to file** is also checked (required for Actions)

### ShareX Testing

**Step 14: Test ShareX Automation**

1. **Prepare**:
   - Close any previous Obsidian windows
   - Open Command Prompt to monitor vault/inbox folder:
     ```cmd
     dir C:\<YOUR_TEST_VAULT_PATH>\inbox
     ```

2. **Capture**:
   - Press your ShareX capture hotkey (default: `Print Screen` for region)
   - Select a region
   - ShareX captures screenshot

3. **Verify**:
   - Check Command Prompt: New files should appear in inbox
   - Obsidian should open showing the card
   - ShareX history should show capture (no errors)

**Expected Result**: 
- New capture card appears in vault/inbox
- Obsidian opens automatically
- Image displays correctly

**If it fails**:
- Check ShareX → History → Errors tab
- Temporarily uncheck "Hidden window" to see console output
- Test the exact command manually in Command Prompt first

**Common Issues**:
- "File not found": `node.exe` path wrong or JavaScript path wrong
- Action doesn't run: "Perform actions" not checked
- Path with spaces: Ensure quotes around JavaScript file path and vault path
- `$input` not working: Verify you wrote `"$input"` (not `$output` or other placeholder)

---

## Automated Test Suite

The repository includes 29 automated tests (run on Linux, passed 100%).

### Step 15: Run Automated Tests

```cmd
npm.cmd test
```

**Expected**:
```
✓ 29 tests passing
✓ 0 tests failing
~96% code coverage
```

**These tests verify**:
- Path validation and security
- Collision handling
- Unicode/spaces support
- Error conditions
- Image byte preservation

**Tests do NOT verify**:
- Obsidian GUI opening (requires Obsidian)
- ShareX automation (requires ShareX + Windows)
- Windows-specific path edge cases

---

## Acceptance Checklist

Use this to track your testing progress:

| Test Category | Test | Status | Notes |
|---------------|------|--------|-------|
| **Prerequisites** | Node.js ≥18.0.0 installed | ☐ Pass / ☐ Fail | Version: _______ |
| | Obsidian installed | ☐ Pass / ☐ Fail | |
| | Empty test vault created | ☐ Pass / ☐ Fail | Path: _______ |
| **Installation** | Download/extract PR branch | ☐ Pass / ☐ Fail | |
| | `npm ci` succeeds | ☐ Pass / ☐ Fail | |
| | `npm run build` succeeds | ☐ Pass / ☐ Fail | |
| | `dist/` folder created | ☐ Pass / ☐ Fail | |
| **Baseline CLI** | Step 2: CLI with --skip-open | ☐ Pass / ☐ Fail | Exit code: ___ |
| | Files created in vault/inbox | ☐ Pass / ☐ Fail | Count: ___ |
| | SHA256 match verified | ☐ Pass / ☐ Fail | |
| | Markdown card structure correct | ☐ Pass / ☐ Fail | |
| **Auto-Open** | Step 5: CLI without --skip-open | ☐ Pass / ☐ Fail | |
| | Command exits (no hang) | ☐ Pass / ☐ Fail | Hung? Yes/No |
| | Obsidian opened | ☐ Pass / ☐ Fail | Manual verify |
| | Card displayed | ☐ Pass / ☐ Fail | |
| | Image renders | ☐ Pass / ☐ Fail | |
| **Collision** | Step 7: 3 rapid captures | ☐ Pass / ☐ Fail | Files: ___ |
| | Unique filenames | ☐ Pass / ☐ Fail | |
| **Unicode/Spaces** | Step 8: Chinese filename | ☐ Pass / ☐ Fail | |
| | Step 9: Spaces in vault path | ☐ Pass / ☐ Fail / ☐ N/A | |
| **Errors** | Step 10: Missing screenshot | ☐ Pass / ☐ Fail | Exit code: ___ |
| | Step 11: Missing vault | ☐ Pass / ☐ Fail | Exit code: ___ |
| | Step 12: Relative path | ☐ Pass / ☐ Fail | Exit code: ___ |
| **ShareX** | Step 14: ShareX automation | ☐ Pass / ☐ Fail / ☐ Not Run | |
| | Capture → card created | ☐ Pass / ☐ Fail / ☐ Not Run | |
| | Obsidian auto-opened | ☐ Pass / ☐ Fail / ☐ Not Run | |
| **Automated** | Step 15: npm test | ☐ Pass / ☐ Fail / ☐ Not Run | 29 tests |

---

## Test Report Template

Copy this template and fill it out after testing. **Redact personal paths** before sharing.

```
=== CAPTURE-INBOX WINDOWS ACCEPTANCE TEST REPORT ===

Tester: [Your Name/Model]
Date: [YYYY-MM-DD]
PR: https://github.com/robertCho/capture-inbox/pull/1
Branch: cursor/sharex-obsidian-cli-4003
Commit: b38465d

ENVIRONMENT
-----------
OS: Windows [version]
Node.js: [version from `node --version`]
Obsidian: [version]
ShareX: [version] or N/A

TEST SETUP
----------
Project Root: C:\[REDACTED]\capture-inbox
Test Vault: C:\[REDACTED]\test-vault-capture-inbox
Node.exe: C:\[REDACTED]\node.exe

INSTALLATION
------------
[ ] npm ci: PASS / FAIL
    Output: [paste if FAIL]

[ ] npm run build: PASS / FAIL
    Output: [paste if FAIL]

BASELINE CLI TEST (--skip-open)
--------------------------------
Command: node bin\capture-inbox.js "[REDACTED]\fixtures\test-image.png" --vault-path "[REDACTED]\test-vault" --skip-open

[ ] Exit Code: 0 / [other]
[ ] Output:
    [paste output here]

[ ] Files Created:
    - Image: [filename]
    - Card: [filename]

[ ] SHA256 Verification: PASS / FAIL
    Original: 6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0
    Copied:   [paste hash]

[ ] Markdown Structure: PASS / FAIL
    Issues: [describe if FAIL]

AUTO-OPEN TEST (Obsidian URI)
------------------------------
Command: [same as above without --skip-open]

[ ] Exit Code: 0 / [other]
[ ] Command Behavior: Exited normally / Hung (Ctrl+C needed)
[ ] Obsidian Opened: YES / NO
[ ] Card Displayed: YES / NO
[ ] Image Rendered: YES / NO

COLLISION TEST
--------------
[ ] 3 rapid captures: PASS / FAIL
[ ] Files created: [count]
[ ] Unique filenames: PASS / FAIL
    Filenames: [list or pattern]

UNICODE/SPACES TEST
-------------------
[ ] Chinese filename test: PASS / FAIL / NOT RUN
[ ] Spaces in path test: PASS / FAIL / NOT RUN / N/A

ERROR TESTS
-----------
[ ] Missing screenshot: PASS / FAIL
    Exit code: [code]
    Error message: [paste]

[ ] Missing vault: PASS / FAIL
    Exit code: [code]
    Error message: [paste]

[ ] Relative path: PASS / FAIL
    Exit code: [code]
    Error message: [paste]

SHAREX INTEGRATION
------------------
[ ] Configuration completed: YES / NO / NOT ATTEMPTED
[ ] Test capture performed: YES / NO
[ ] Result: PASS / FAIL / NOT RUN

If FAIL or NOT RUN, explain:
[details]

AUTOMATED TESTS
---------------
[ ] npm test: PASS / FAIL / NOT RUN
    Tests: __/29 passed
    Output: [paste if failures]

OVERALL ASSESSMENT
------------------
Milestone 1 implementation: READY FOR PRODUCTION / NEEDS FIXES / BLOCKED

Issues Found:
1. [issue description]
2. [issue description]

Recommendations:
[any suggestions]

ATTACHMENTS
-----------
[List any error logs, screenshots (redacted), etc.]

=== END REPORT ===
```

---

## Known Limitations (Milestone 1)

1. **No OCR**: Text in screenshots is not extracted (placeholder shown)
2. **No AI Summary**: No summarization (placeholder shown)
3. **URI Launch Verification**: Tool cannot confirm Obsidian actually opened
4. **Windows Testing**: Developed on Linux, requires Windows manual acceptance
5. **ShareX Placeholder**: Uses `$input` (confirmed correct via official docs and source code)

---

## Troubleshooting

### "npm is not recognized"

Node.js not installed or not in PATH. Reinstall Node.js with "Add to PATH" option checked.

### "execution policy" errors (PowerShell)

Use **Command Prompt** (cmd.exe) instead of PowerShell to avoid policy issues.

### "Screenshot file not found"

- Path must be **absolute** (e.g., `C:\...`, not `fixtures\test-image.png`)
- Check path is correct with `dir <path>`
- On Windows, backslashes `\` or forward slashes `/` both work

### "Vault directory not found"

- Vault path must exist and be absolute
- Create the directory first if testing with new path
- Obsidian must have opened the vault at least once for URI to work

### "Obsidian didn't open"

- Test manually: Open browser, navigate to `obsidian://open?vault=test-vault-capture-inbox`
- If that fails, URI protocol not registered (reinstall Obsidian)
- Tool reports "URI launched" but cannot verify Obsidian responded - this is expected

### ShareX action doesn't run

- Check "Perform actions" is enabled in After capture tasks
- Check "Save image to file" is also enabled (required)
- Temporarily uncheck "Hidden window" to see error messages
- Verify `node.exe` path with `where node`
- Test the exact command in Command Prompt manually first

### "Access denied" or "permission denied"

- Vault directory is read-only or protected
- Run Command Prompt as Administrator (not recommended as default)
- OR choose vault path in your user directory

---

## Important Notes

### Security & Privacy

- ⚠️ **Test vault only**: Do not test with your personal vault initially
- ⚠️ **Synthetic fixtures**: Use repository's `fixtures\test-image.png`, not real screenshots
- ⚠️ **No data uploaded**: Tool does not upload anything (no internet connection needed)
- ⚠️ **Redact paths**: When sharing test results, redact personal paths

### No Credentials or Costs

- ✅ No AI API keys required
- ✅ No billing or subscription changes
- ✅ No network requests
- ✅ Works completely offline

### Repository vs Personal Data

- ✅ Repository contains: Synthetic fixtures only (fake screenshots)
- ❌ Do NOT commit: Real screenshots, actual vault data, personal paths
- ✅ `.gitignore` prevents accidental commits of personal data

---

## What's Next After Testing

**Do NOT**:
- Merge the PR yourself
- Deploy or publish packages
- Modify billing settings
- Enable any paid services
- Use this with sensitive screenshots until reviewing security for your use case

**DO**:
- Fill out the test report template
- Report results: PASS/FAIL for each section
- Include error messages (redacted paths)
- Distinguish: "Automated test passed" vs "Windows manual test passed"
- Note any discrepancies or issues

**After approval, next milestones will add**:
- Milestone 2: OCR text extraction
- Milestone 3: AI-powered summarization  
- Milestone 4: AI provider configuration

---

## Reference Links

- **This PR**: https://github.com/robertCho/capture-inbox/pull/1
- **ShareX Actions Documentation**: https://getsharex.com/actions
- **ShareX Actions Source Code**: https://github.com/ShareX/ShareX/blob/master/ShareX.HelpersLib/ExternalProgram.cs
- **Detailed ShareX Setup**: See `SHAREX-SETUP.md` in this repository
- **Node.js Download**: https://nodejs.org/
- **Obsidian Download**: https://obsidian.md/

---

## Summary: Linux vs Windows Status

| Test Type | Linux (Automated) | Windows (Manual) |
|-----------|-------------------|------------------|
| Installation (npm ci, build) | ✅ VERIFIED | ⚠️ PENDING |
| CLI with synthetic fixtures | ✅ VERIFIED | ⚠️ PENDING |
| SHA256 byte preservation | ✅ VERIFIED | ⚠️ PENDING |
| Collision handling | ✅ VERIFIED | ⚠️ PENDING |
| Unicode/spaces paths | ✅ VERIFIED | ⚠️ PENDING |
| Error handling | ✅ VERIFIED | ⚠️ PENDING |
| 29 automated tests | ✅ 29/29 PASS | ⚠️ RUN ON WINDOWS |
| Obsidian URI open | ❌ Cannot test (no GUI) | ⚠️ PENDING |
| Obsidian image render | ❌ Cannot test (no GUI) | ⚠️ PENDING |
| ShareX automation | ❌ Cannot test (no ShareX) | ⚠️ PENDING |
| Windows path edge cases | ⚠️ Limited on Linux | ⚠️ PENDING |

**Core implementation**: ✅ Verified working on Linux with synthetic data  
**Windows acceptance**: ⚠️ Requires manual testing per this guide

---

*README version: PR branch `cursor/sharex-obsidian-cli-4003`, commit b38465d*
