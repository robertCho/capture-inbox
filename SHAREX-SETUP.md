# ShareX Integration Setup Guide

This guide documents the integration between ShareX and capture-inbox based on ShareX's official Actions documentation.

**Important**: ShareX "Actions" feature uses `$input`/`$output` placeholders (not to be confused with "Custom Uploader" which uses `%filepath`, `$output`, etc.). We use Actions for after-capture automation.

## Prerequisites

1. **ShareX installed** - Download from https://getsharex.com/
2. **Node.js installed** - Version 18 or higher
3. **capture-inbox built** - Run `npm install && npm run build` in this repository
4. **Obsidian installed** - With vault already created

## Step-by-Step Setup

### 1. Locate Your Node.js Installation

Open Command Prompt and run:

```cmd
where node
```

This will output something like: `C:\Program Files\nodejs\node.exe`

Copy this path - you'll need it for ShareX configuration.

### 2. Locate Your capture-inbox Installation

Note the full path to this repository. For example:
- `C:\Users\YourName\Documents\capture-inbox`

### 3. Configure ShareX After-Capture Action

1. Open **ShareX**
2. Go to **Task settings** (or right-click tray icon → Task settings)
3. Navigate to **Actions** tab
4. Click **Add** button (or the + icon)
5. Fill in the following fields:

**Action Configuration:**

| Field | Value |
|-------|-------|
| Name | `Capture to Obsidian` |
| File path | `C:\Program Files\nodejs\node.exe` *(adjust to your Node.js path)* |
| Arguments | `"C:\Users\YourName\Documents\capture-inbox\bin\capture-inbox.js" "$input" --vault-path "C:\Users\YourName\Documents\MyVault"` |
| Working directory | *(leave empty or set to capture-inbox directory)* |
| Extensions | *(leave empty for all)* |
| Hidden window | ☑ *(optional - hides console window)* |

**Important**: Replace these paths with YOUR actual paths:
- Node.js path: from step 1
- capture-inbox path: from step 2
- Vault path: your Obsidian vault location

### 4. Enable the Action

1. Still in ShareX → **After capture tasks**
2. Check the box next to **✓ Run action**
3. Click **OK** to save

### 5. Test the Integration

1. Use ShareX to capture a region (default: `Print Screen`)
2. Check if:
   - Screenshot appears in your vault's `inbox/attachments/` folder
   - A Markdown card is created in `inbox/` with a relative `attachments/...` image ref
   - Obsidian opens automatically with the new card
   - The embedded image displays correctly
   - The card is source-less (no `claudeCodeSessionId`) unless you passed `--session-id`

## ShareX Actions Placeholder Variables

These are **verified** from ShareX official Actions documentation and source code:

| Placeholder | Description | Use Case |
|-------------|-------------|----------|
| `$input` | Full path to the captured file | **Use this for after-capture actions** |
| `$output` | Full path to output file | For actions that create new/processed files |

For this integration, we use `$input` to get the full path to the screenshot ShareX just captured.

**Official Source**:
- Actions documentation: https://getsharex.com/actions
- Source code: https://github.com/ShareX/ShareX/blob/master/ShareX.HelpersLib/ExternalProgram.cs

**Important Distinction**: ShareX has two separate features:
- **Actions** (after-capture): Uses `$input` and `$output` — we use this
- **Custom Uploader**: Uses `%filepath`, `%filename`, etc. — different feature

## Example Configuration

### Example 1: Basic Setup

```plaintext
File path: C:\Program Files\nodejs\node.exe
Arguments: "C:\Users\Alice\capture-inbox\bin\capture-inbox.js" "$input" --vault-path "C:\Users\Alice\Documents\MyVault"
```

### Example 2: Custom Inbox Subdirectory

```plaintext
File path: C:\Program Files\nodejs\node.exe
Arguments: "C:\Users\Alice\capture-inbox\bin\capture-inbox.js" "$input" --vault-path "C:\Users\Alice\Documents\MyVault" --inbox-subdir "daily\screenshots"
```

### Example 3: Path with Spaces (requires quotes)

```plaintext
File path: C:\Program Files\nodejs\node.exe
Arguments: "C:\Users\Alice\My Projects\capture-inbox\bin\capture-inbox.js" "$input" --vault-path "C:\Users\Alice\My Documents\My Vault"
```

## Troubleshooting

### Action doesn't run

**Check:**
- ShareX → After capture tasks → "Run action" is checked
- Node.js path is correct (`where node` in CMD)
- capture-inbox path is correct
- Using `$input` not `$output` in Arguments field
- All paths in Arguments are wrapped in quotes if they contain spaces

**Test manually:**
1. Capture a screenshot with ShareX
2. Note the file path (ShareX shows it briefly)
3. Open Command Prompt and run:
   ```cmd
   "C:\Program Files\nodejs\node.exe" "C:\path\to\capture-inbox\bin\capture-inbox.js" "C:\path\to\screenshot.png" --vault-path "C:\path\to\vault"
   ```

### Console window flashes and closes

This is normal behavior. To see error messages:
1. Temporarily uncheck "Hidden window" in ShareX action settings
2. Capture a screenshot
3. Read the console output before it closes
4. Or run manually in Command Prompt to see full output

### "File not found" or "Vault not found" errors

**Check:**
- Vault path exists and is absolute (e.g., `C:\Users\...`)
- No typos in vault path
- ShareX actually saved the screenshot (check ShareX history)
- capture-inbox is built (`npm run build` in repository)

### Obsidian doesn't open

**Check:**
- Obsidian is installed
- Vault name in URI matches actual vault name
- Test manually: open browser and navigate to:
  ```
  obsidian://open?vault=YourVaultName
  ```
- Windows URI protocol is registered (reinstall Obsidian if needed)

**Note**: The tool reports "URI launched" but cannot verify if Obsidian actually responded. This is a Windows URI limitation.

### Screenshots work but cards don't appear

**Check:**
- Vault path is correct
- You have write permissions to vault directory
- Inbox directory isn't being blocked by antivirus
- Check vault/inbox folder directly in File Explorer
- Confirm you're using `$input` placeholder (not `$output` or custom uploader variables)

## Advanced Configuration

### Multiple Capture Profiles

ShareX allows multiple actions. You can create separate profiles:

1. **Work Vault**: 
   - Action name: `Capture to Work Vault`
   - Arguments: `"...\capture-inbox.js" "$input" --vault-path "C:\Work\Vault"`

2. **Personal Vault**:
   - Action name: `Capture to Personal Vault`
   - Arguments: `"...\capture-inbox.js" "$input" --vault-path "C:\Personal\Vault"`

Enable/disable in ShareX → After capture tasks as needed.

### Different Inbox Subdirectories

Organize captures by context:

```plaintext
# For meetings
--inbox-subdir "meetings"

# For daily captures
--inbox-subdir "daily\2026-11"

# For project captures
--inbox-subdir "projects\project-name"
```

### Keyboard Shortcuts

In ShareX → Hotkey settings:
- Set different hotkeys for different capture types
- Each can trigger different actions
- Example: `Ctrl+Print Screen` for personal vault, `Alt+Print Screen` for work vault

## Testing Without Obsidian Auto-Open

For testing or if you don't want Obsidian to open automatically:

```plaintext
Arguments: "C:\path\to\capture-inbox\bin\capture-inbox.js" "$input" --vault-path "C:\path\to\vault" --skip-open
```

Then manually open the cards in Obsidian later.

## Official ShareX Documentation

For more advanced ShareX features:
- **Actions documentation**: https://getsharex.com/actions (what we use)
- Actions source code: https://github.com/ShareX/ShareX/blob/master/ShareX.HelpersLib/ExternalProgram.cs
- Official docs: https://getsharex.com/docs/
- Custom uploaders (different feature): https://getsharex.com/docs/custom-uploader

## Windows Testing Checklist

Before reporting issues, verify:
- [ ] Node.js version 18+ installed
- [ ] capture-inbox built successfully (`npm run build`)
- [ ] Manual command works in Command Prompt
- [ ] ShareX `$output` actually contains file path (check ShareX history)
- [ ] Vault path is absolute and exists
- [ ] You have write permissions to vault directory
- [ ] Obsidian URI protocol works (test in browser)

## Session ID and attachments (v0.3.0)

ShareX After Capture does **not** inherit `CLAUDE_CODE_SESSION_ID`. Leave session
unset (source-less card) unless you intentionally pass `--session-id` in the
action arguments. Do not point ShareX at a "latest session" file.

New images are stored in `<vault>/<inbox>/attachments/`. Cards stay in the inbox
root. Existing same-folder cards still append.

## Getting Help

If you encounter issues:
1. Test the command manually in Command Prompt first
2. Uncheck "Hidden window" to see error messages
3. Verify all paths are correct and absolute
4. Check Windows Event Viewer for detailed error logs
5. Open an issue with:
   - Node.js version (`node --version`)
   - ShareX version
   - Full error message (if any)
   - Command that fails when run manually
