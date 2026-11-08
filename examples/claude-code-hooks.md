# Claude Code hook usage (official stdin contract)

Use this only when `capture-inbox` is launched as a Claude Code **hook command**.
Hooks receive JSON on stdin with `session_id`. That is an official public field
([hooks reference](https://code.claude.com/docs/en/hooks)). This tool reads
`session_id` and ignores `transcript_path`.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node /ABS/PATH/capture-inbox/bin/capture-inbox.js /ABS/PATH/screenshot.png --vault-path /ABS/PATH/vault --from-hook --skip-open"
          }
        ]
      }
    ]
  }
}
```

Replace the screenshot path with a real file your hook already has. A hook does
not invent a screenshot; `--from-hook` only associates the official `session_id`.

Child processes of Claude Code (Bash/PowerShell tools, hook commands, stdio MCP)
also receive `CLAUDE_CODE_SESSION_ID`. In that case `--from-hook` is optional:
the CLI reads the env var automatically.

ShareX After Capture is not a Claude Code child. Do not add a SessionStart hook
that writes a "latest session" file for ShareX — multiple CLI sessions would
make "latest" ambiguous, and this tool refuses that guess.
