# Opt-in Claude Code hooks (liveness only)

These handlers read official hook JSON from stdin (`session_id`, `hook_event_name`).
They never read `transcript_path`. They never arm a session and never pick
“latest/only live”.

This repository will **not** write your `~/.claude/settings.json`. Merge yourself.

## Print a fragment

```bash
node bin/capture-inbox.js --print-hooks --vault-path "C:\ABS\YOUR_VAULT"
```

## Merge without deleting existing hooks

```bash
node bin/capture-inbox.js --merge-hooks --settings-file "C:\ABS\path\to\settings.json" --vault-path "C:\ABS\YOUR_VAULT"
```

`--settings-file` is required and is never defaulted to a home-directory path.
Re-running merge is idempotent (our `--hook-event` command is left as-is).

## Then arm from inside Claude Code

```bash
node bin/capture-inbox.js --arm --vault-path "C:\ABS\YOUR_VAULT"
```

ShareX After Capture does not change: it stamps the unique live armed ID, or
stays source-less if none/stale/ambiguous.
