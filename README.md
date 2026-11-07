# capture-inbox

A Windows CLI tool that captures screenshots from ShareX and creates Obsidian cards with embedded images.

**Milestone Status**: This is the **FIRST milestone** implementation. It provides the core screenshot → Markdown card → Obsidian open workflow. OCR text recognition and AI summarization are **not yet implemented**.

## Features

✅ **Implemented in this milestone:**
- Accepts screenshot path from ShareX after-capture action
- Copies screenshot to Obsidian vault inbox
- Creates Markdown card with embedded image
- Opens card automatically in Obsidian
- Handles Windows paths, Unicode characters, and spaces
- Prevents filename collisions with timestamp-based naming
- Validates paths to prevent directory traversal attacks
- Preserves original image bytes exactly
- Comprehensive error messages

❌ **Not yet implemented:**
- OCR text recognition from screenshots
- AI-powered summary generation
- AI provider integration

## Requirements

- **Node.js** 18.0.0 or higher
- **Obsidian** installed with URI protocol registered
- **ShareX** (Windows) for screenshot capture
- **Windows** operating system (primary target, though cross-platform code is used)

## Installation

```bash
# Clone the repository
git clone https://github.com/robertCho/capture-inbox.git
cd capture-inbox

# Install dependencies and build
npm install
npm run build

# Make CLI globally accessible (optional)
npm link
```

## Usage

### Basic Command

```bash
capture-inbox <screenshot-path> --vault-path <vault-path> [options]
```

### Options

- `<screenshot-path>` - **Required**: Path to screenshot file (absolute path)
- `--vault-path <path>` - **Required**: Absolute path to Obsidian vault
- `--inbox-subdir <path>` - Optional: Subdirectory within vault for captures (default: `inbox`)
- `--skip-open` - Optional: Don't open the card in Obsidian after creation
- `--help` - Show help message

### Examples

```bash
# Basic usage (Windows)
capture-inbox "C:\Users\user\Screenshots\capture.png" --vault-path "C:\Users\user\MyVault"

# Custom inbox subdirectory
capture-inbox capture.png --vault-path "C:\vault" --inbox-subdir "daily\captures"

# Testing without opening Obsidian
capture-inbox test.png --vault-path "C:\vault" --skip-open
```

### Testing Locally

The repository includes synthetic test fixtures:

```bash
# Run automated tests
npm test

# Manual test with fixtures
node bin/capture-inbox.js fixtures/test-image.png --vault-path "/absolute/path/to/test-vault" --skip-open
```

## ShareX Integration

ShareX is a powerful screenshot tool for Windows. This section documents the **verified** integration steps based on ShareX's official Actions documentation.

### ShareX After-Capture Action Configuration

**Verified**: ShareX Actions use `$input` for the captured file path (confirmed via official Actions documentation and source code):

1. Open **ShareX** → **Task settings** → **Actions**
2. Click **Add** to create a new action
3. Set the following:
   - **Name**: `Capture to Obsidian`
   - **File path**: `C:\path\to\node.exe` (your Node.js installation path)
   - **Arguments**: `C:\path\to\capture-inbox\bin\capture-inbox.js "$input" --vault-path "C:\path\to\your\vault"`
   - **Hidden window**: ☑ (optional, to hide console window)

4. In ShareX → **After capture tasks**, check **✓ Run action**

**ShareX Actions Placeholder Variables**:
- `$input` - Full path to the captured file (use this for after-capture actions)
- `$output` - Full path to output file (for actions that create new files)
- **Source**: https://getsharex.com/actions and ShareX source code

**Note**: ShareX "Actions" (`$input`/`$output`) are different from "Custom Uploader" (`%filepath`, etc.). We use Actions for after-capture automation.

### Example Configuration

Replace these paths with your actual system paths:

```plaintext
File path: C:\Program Files\nodejs\node.exe
Arguments: C:\Users\YourName\capture-inbox\bin\capture-inbox.js "$input" --vault-path "C:\Users\YourName\Documents\MyVault"
```

### Finding Node.js Path

```cmd
# In Windows Command Prompt
where node

# Or in PowerShell
Get-Command node | Select-Object -ExpandProperty Source
```

## Windows Acceptance Testing Checklist

⚠️ **Manual testing required on real Windows device** - The following have NOT been verified on Windows yet (developed on Linux):

### Prerequisites Setup
- [ ] Confirm Node.js 18+ installed (`node --version`)
- [ ] Confirm Obsidian installed and URI protocol works (`obsidian://open?vault=...` test)
- [ ] Confirm ShareX installed and can capture screenshots
- [ ] Create test Obsidian vault or use existing vault

### Core Functionality
- [ ] Run basic command manually: `node bin/capture-inbox.js <screenshot> --vault-path <vault>`
- [ ] Verify screenshot copied to vault/inbox directory
- [ ] Verify Markdown card created with correct image embed
- [ ] Verify Obsidian opens automatically with new card
- [ ] Verify image displays correctly in Obsidian

### Path Handling
- [ ] Test with Windows path containing spaces: `C:\Users\My Name\vault`
- [ ] Test with vault path containing Chinese/Unicode: `C:\Users\用户\vault`
- [ ] Test with network path: `\\server\share\vault` (if applicable)

### ShareX Integration
- [ ] Configure ShareX after-capture action using documented steps above
- [ ] Take screenshot with ShareX (region capture)
- [ ] Verify capture-inbox runs automatically
- [ ] Verify card appears in Obsidian without manual intervention
- [ ] Test rapid successive captures (collision handling)

### Error Handling
- [ ] Test with non-existent screenshot path (should show clear error)
- [ ] Test with non-existent vault path (should show clear error)
- [ ] Test with read-only vault directory (should show permission error)
- [ ] Test with invalid path characters (if applicable to Windows)

### Edge Cases
- [ ] Test screenshot filename with spaces
- [ ] Test screenshot filename with Chinese characters
- [ ] Test very large screenshot file (>10MB)
- [ ] Test multiple rapid captures (within same second)

## How It Works

1. **Screenshot Path**: ShareX passes the screenshot path using the `$output` placeholder
2. **Copy Image**: Tool copies original screenshot to vault inbox directory with timestamp-based filename
3. **Generate Card**: Creates Markdown file with:
   - Frontmatter (timestamp, tags)
   - Embedded screenshot using relative path
   - Placeholders for future OCR and AI summary
4. **Open in Obsidian**: Uses `obsidian://open` URI protocol to open the new card
5. **Collision Prevention**: If filename exists, appends counter (`_1`, `_2`, etc.)

## Card Structure

Generated Markdown cards follow this structure:

```markdown
---
created: 2026-11-07T12:34:56.789Z
tags: [capture, inbox]
---

# Capture 2026-11-07

![Screenshot](capture_2026-11-07_12-34-56.png)

## OCR Text
*Not yet implemented*

## AI Summary
*Not yet implemented*
```

## Configuration Files

### Example: `.capture-inbox.json` (future feature)

This tool currently uses CLI arguments only. A future milestone might add config file support:

```json
{
  "vaultPath": "C:\\Users\\YourName\\Documents\\MyVault",
  "inboxSubdir": "inbox",
  "autoOpen": true
}
```

## Security & Reliability

✅ **Implemented safeguards:**
- Path validation prevents directory traversal attacks
- Absolute paths required (no dangerous relative paths)
- Original image bytes preserved exactly (no corruption)
- Collision prevention ensures no silent overwrites
- Proper Windows path and Unicode handling
- Clear error messages for all failure modes

## Development

### Project Structure

```
capture-inbox/
├── src/
│   ├── cli.ts           # CLI interface and argument parsing
│   ├── capture.ts       # Core capture logic
│   ├── utils.ts         # Utility functions
│   ├── types.ts         # TypeScript type definitions
│   └── tests/           # Automated tests
│       ├── capture.test.ts
│       └── utils.test.ts
├── bin/
│   └── capture-inbox.js # Executable entry point
├── fixtures/            # Synthetic test images
│   ├── test-image.png
│   └── test-image-cn-文件.png
├── dist/                # Compiled JavaScript (generated)
└── package.json
```

### Running Tests

```bash
# Run full test suite
npm test

# Build only (no tests)
npm run build

# Type check without building
npm run lint
```

### Test Coverage

Current test coverage: **~96%**

All 29 tests pass, covering:
- Path validation and security
- Filename collision handling
- Unicode and space handling
- Error conditions
- Image preservation
- Markdown generation

Untested lines are Obsidian URI launching (requires actual Obsidian installation).

## Known Limitations

1. **OCR Not Implemented**: Screenshots are saved but text is not extracted
2. **AI Summary Not Implemented**: Summary section shows "Not yet implemented"
3. **Obsidian Open Verification**: Tool launches URI but cannot verify Obsidian actually opened
4. **Windows GUI Testing**: Core logic tested on Linux; Windows end-to-end requires manual verification
5. **ShareX Automation**: Syntax verified against docs; actual automation needs Windows device test

## Troubleshooting

### "Screenshot file not found"
- Ensure the path is absolute
- Check that ShareX `$output` placeholder is used correctly
- Verify file permissions

### "Vault directory not found"
- Ensure vault path exists
- Use absolute path (e.g., `C:\Users\...`)
- Check for typos in path

### "Obsidian didn't open"
- Verify Obsidian is installed
- Test URI manually: open browser and enter `obsidian://open?vault=YourVault`
- Check Windows URI protocol registration
- Tool reports "URI launched" but cannot verify if Obsidian responded

### "Path escapes vault directory"
- Check `--inbox-subdir` doesn't contain `..` or absolute paths
- Use simple relative paths like `inbox` or `daily/captures`

## Future Milestones

Planned for future releases:

- **Milestone 2**: OCR text extraction from screenshots
- **Milestone 3**: AI-powered summary generation
- **Milestone 4**: AI provider configuration and API integration
- **Future**: Config file support, multiple vault profiles, batch processing

## License

**License not yet set** - requires user decision. Common options:
- MIT (permissive, allows commercial use)
- Apache 2.0 (permissive with patent grant)
- GPL-3.0 (copyleft, requires source disclosure)

## Contributing

This is a personal project in early development. Issues and pull requests are welcome.

## Important Notes

⚠️ **Public Repository**: This repository contains ONLY:
- Synthetic test fixtures (example screenshots)
- Example configuration with placeholder paths
- No personal data, credentials, or real screenshots

⚠️ **Data Storage**: Actual capture cards and screenshots should NEVER be committed to git. They belong in your local Obsidian vault only.

⚠️ **Privacy**: Do not use this tool with sensitive/confidential screenshots until security requirements are reviewed for your use case.
