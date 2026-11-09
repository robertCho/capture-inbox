import { parseArgs } from 'node:util';
import { stdin } from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureScreenshot } from './capture.js';
import type { CaptureConfig, CaptureAction } from './types.js';
import {
  CLAUDE_CODE_SESSION_ENV,
  parseHookSessionId,
  resolveSessionProvenance,
  type SessionProvenance,
} from './provenance.js';
import { createError, validateAbsolutePath } from './utils.js';
import { withLock } from './lock.js';
import {
  applyHookEventToRegistry,
  armSession,
  disarmSession,
  resolveArmedAssociation,
} from './session-registry.js';
import {
  buildHookCommand,
  buildHookSettingsFragment,
  mergeHooksIntoSettingsFile,
} from './hooks-setup.js';

interface CliArgs {
  values: {
    'vault-path'?: string;
    'inbox-subdir'?: string;
    'skip-open'?: boolean;
    'action'?: string;
    'session-id'?: string;
    'from-hook'?: boolean;
    'hook-event'?: boolean;
    arm?: boolean;
    disarm?: boolean;
    'print-hooks'?: boolean;
    'merge-hooks'?: boolean;
    'settings-file'?: string;
    help?: boolean;
  };
  positionals: string[];
}

const USAGE = `
capture-inbox - Capture screenshots from ShareX to Obsidian

USAGE:
  capture-inbox <screenshot-path> --vault-path <path> [options]
  capture-inbox --arm --vault-path <path>
  capture-inbox --hook-event --vault-path <path>
  capture-inbox --print-hooks --vault-path <path>
  capture-inbox --merge-hooks --settings-file <path> --vault-path <path>

ARGUMENTS:
  <screenshot-path>    Path to the screenshot file (required for create/append)

OPTIONS:
  --vault-path <path>       Path to the Obsidian vault (required)
  --inbox-subdir <path>     Subdirectory within vault for captures (default: "inbox")
  --action <type>           Action type: "create" or "append" (default: "create")
  --session-id <id>         Explicit Claude Code session ID (does not guess latest)
  --from-hook               Capture: read official hook JSON from stdin and use session_id
  --hook-event              Registry only: read official hook JSON (SessionStart/End/...)
  --arm                     Mark this Claude Code session as the ShareX capture target
  --disarm                  Clear the armed capture target for this vault/inbox
  --print-hooks             Print an opt-in Claude Code hooks fragment (stdout)
  --merge-hooks             Merge that fragment into --settings-file (preserves existing hooks)
  --settings-file <path>    Claude Code settings JSON (required for --merge-hooks; never inferred)
  --skip-open               Don't open the card in Obsidian after creation
  --help                    Show this help message

SESSION ASSOCIATION (ShareX):
  ShareX is not a Claude Code child, so it has no CLAUDE_CODE_SESSION_ID.
  This tool does not guess the latest/only live session or read transcripts.

  Contract: screenshots stamp the session you explicitly armed.

  1. One-time: merge or paste opt-in hooks (SessionStart, SessionEnd, UserPromptSubmit).
     Hooks update liveness in our registry only. They never arm a session.
  2. Each discussion you want on cards: inside THAT Claude Code session run:
       capture-inbox --arm --vault-path "YOUR_VAULT"
     --arm reads CLAUDE_CODE_SESSION_ID from the environment (no typing).
     Switching Claude sessions: run --arm again in the new session.
  3. ShareX create/append stays unchanged. If a unique live armed session exists,
     the card gets that ID. Missing/stale/ambiguous/ended => source-less (no wrong ID).

  Direct Claude Code child captures still use env / --from-hook first.
  Resume later with: claude --resume <session-id>  (metadata only; no message jump)

EXAMPLES:
  capture-inbox --print-hooks --vault-path "C:\\Users\\user\\ObsidianVault"
  capture-inbox --arm --vault-path "C:\\Users\\user\\ObsidianVault"
  capture-inbox "$input" --vault-path "C:\\Users\\user\\ObsidianVault"
  capture-inbox "$input" --vault-path "C:\\Users\\user\\ObsidianVault" --action append
`;

const HOOK_STDIN_TIMEOUT_MS = 2000;

export async function readHookStdin(
  stream: NodeJS.ReadableStream = stdin,
  timeoutMs: number = HOOK_STDIN_TIMEOUT_MS
): Promise<string> {
  const readable = stream as NodeJS.ReadStream;
  if (typeof readable.isTTY === 'boolean' && readable.isTTY) {
    throw createError('--from-hook requires hook JSON on stdin', 'INVALID_HOOK_INPUT');
  }

  return await new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const timer = setTimeout(() => {
      cleanup();
      reject(createError('--from-hook timed out waiting for stdin JSON', 'INVALID_HOOK_INPUT'));
    }, timeoutMs);

    const onData = (chunk: string | Buffer) => {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    };
    const onEnd = () => {
      cleanup();
      resolve(chunks.join(''));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      stream.off('data', onData);
      stream.off('end', onEnd);
      stream.off('error', onError);
    };

    stream.setEncoding('utf8');
    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onError);
  });
}

function fail(err: Error & { code?: string }): never {
  console.error('✗ Capture failed:', err.message);
  if (err.code === 'SESSION_ID_CONFLICT') {
    console.error('  Provided session IDs disagree. Refusing to guess which session to use.');
  } else if (err.code === 'INVALID_SESSION_ID') {
    console.error('  Session IDs must come from official Claude Code env/hooks, --arm, or --session-id.');
    console.error('  This tool never picks the latest/active session or reads transcripts.');
  } else if (err.code === 'FILE_NOT_FOUND') {
    console.error('  The screenshot file does not exist or is not readable');
  } else if (err.code === 'VAULT_NOT_FOUND') {
    console.error('  The vault directory does not exist');
    console.error('  Please create the vault directory or check the path');
  } else if (err.code === 'PATH_ESCAPE') {
    console.error('  The configured path attempts to escape the vault directory');
    console.error('  This is a security error - check your --inbox-subdir setting');
  } else if (err.code === 'RELATIVE_PATH') {
    console.error('  Paths must be absolute');
    console.error('  Use full paths like C:\\\\Users\\\\user\\\\vault (Windows) or /home/user/vault (Unix)');
  } else if (err.code === 'NO_TARGET') {
    console.error('  No current target card exists');
    console.error('  Create a new card first with: --action create');
    console.error('  Then you can append to it with: --action append');
  } else if (err.code === 'TARGET_MISSING') {
    console.error('  The current target card has been deleted or moved');
    console.error('  Create a new card with: --action create');
  } else if (err.code === 'SESSION_MISMATCH') {
    console.error('  This card is already associated with a different Claude Code session');
    console.error('  Create a new card for the other session, or omit --session-id to keep the card ID');
  }
  process.exit(1);
}

function defaultBinPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'bin', 'capture-inbox.js');
}

export async function main(argv: string[]): Promise<void> {
  let args: CliArgs;
  
  try {
    args = parseArgs({
      args: argv,
      options: {
        'vault-path': { type: 'string' },
        'inbox-subdir': { type: 'string' },
        'skip-open': { type: 'boolean', default: false },
        'action': { type: 'string' },
        'session-id': { type: 'string' },
        'from-hook': { type: 'boolean', default: false },
        'hook-event': { type: 'boolean', default: false },
        'arm': { type: 'boolean', default: false },
        'disarm': { type: 'boolean', default: false },
        'print-hooks': { type: 'boolean', default: false },
        'merge-hooks': { type: 'boolean', default: false },
        'settings-file': { type: 'string' },
        'help': { type: 'boolean', default: false },
      },
      allowPositionals: true,
    }) as CliArgs;
  } catch (error) {
    console.error('Error parsing arguments:', (error as Error).message);
    console.log(USAGE);
    process.exit(1);
  }

  if (args.values.help) {
    console.log(USAGE);
    process.exit(0);
  }

  const setupMode = Boolean(
    args.values.arm ||
    args.values.disarm ||
    args.values['hook-event'] ||
    args.values['print-hooks'] ||
    args.values['merge-hooks']
  );

  if (!setupMode && args.positionals.length === 0) {
    console.error('Error: Screenshot path is required');
    console.log(USAGE);
    process.exit(1);
  }

  if (!args.values['vault-path']) {
    console.error('Error: --vault-path is required');
    console.log(USAGE);
    process.exit(1);
  }

  const vaultPath = args.values['vault-path'];
  const inboxSubdir = args.values['inbox-subdir'] || 'inbox';

  try {
    validateAbsolutePath(vaultPath, 'Vault path');
  } catch (error) {
    fail(error as Error & { code?: string });
  }

  if (args.values['print-hooks']) {
    const command = buildHookCommand({
      nodePath: process.execPath,
      binPath: defaultBinPath(),
      vaultPath,
      inboxSubdir,
    });
    console.log(JSON.stringify(buildHookSettingsFragment(command), null, 2));
    process.exit(0);
  }

  if (args.values['merge-hooks']) {
    if (!args.values['settings-file']) {
      console.error('Error: --settings-file is required for --merge-hooks (path is never inferred)');
      process.exit(1);
    }
    try {
      validateAbsolutePath(args.values['settings-file'], 'Settings file');
      const command = buildHookCommand({
        nodePath: process.execPath,
        binPath: defaultBinPath(),
        vaultPath,
        inboxSubdir,
      });
      const result = await mergeHooksIntoSettingsFile(args.values['settings-file'], command);
      console.log('✓ Hooks merged (existing handlers preserved)');
      console.log(`  Added: ${result.added.join(', ') || '(none)'}`);
      console.log(`  Already present: ${result.skipped.join(', ') || '(none)'}`);
      console.log(`  Settings file: ${args.values['settings-file']}`);
      process.exit(0);
    } catch (error) {
      fail(error as Error & { code?: string });
    }
  }

  if (args.values.disarm) {
    try {
      await withLock(vaultPath, inboxSubdir, 'disarm', async () => {
        await disarmSession(vaultPath, inboxSubdir);
      });
      console.log('✓ Disarmed capture session for this vault/inbox');
      process.exit(0);
    } catch (error) {
      fail(error as Error & { code?: string });
    }
  }

  if (args.values.arm) {
    const sessionId = args.values['session-id'] || process.env[CLAUDE_CODE_SESSION_ENV];
    if (!sessionId) {
      console.error('✗ --arm needs CLAUDE_CODE_SESSION_ID (run it inside Claude Code) or --session-id');
      console.error('  Refusing to guess a session from the registry.');
      process.exit(1);
    }
    try {
      const registry = await withLock(vaultPath, inboxSubdir, 'arm', async () => {
        return await armSession(vaultPath, inboxSubdir, sessionId);
      });
      console.log('✓ Armed Claude Code session for ShareX captures');
      console.log(`  Session: ${registry.armedSessionId}`);
      console.log('  Re-run --arm in another session to switch. ShareX create/append will stamp this ID.');
      process.exit(0);
    } catch (error) {
      fail(error as Error & { code?: string });
    }
  }

  if (args.values['hook-event']) {
    try {
      const hookJson = await readHookStdin();
      const registry = await withLock(vaultPath, inboxSubdir, 'hook-event', async () => {
        return await applyHookEventToRegistry(vaultPath, inboxSubdir, hookJson);
      });
      console.log('✓ Hook event applied (liveness only; session not armed)');
      console.log(`  Known sessions: ${Object.keys(registry.sessions).length}`);
      console.log(`  Armed: ${registry.armedSessionId ?? 'none'}`);
      process.exit(0);
    } catch (error) {
      fail(error as Error & { code?: string });
    }
  }

  const action = args.values['action'] || 'create';
  if (action !== 'create' && action !== 'append') {
    console.error(`Error: Invalid action "${action}". Must be "create" or "append"`);
    console.log(USAGE);
    process.exit(1);
  }

  let hookSessionId: string | null | undefined;
  if (args.values['from-hook']) {
    try {
      const hookJson = await readHookStdin();
      hookSessionId = parseHookSessionId(hookJson);
    } catch (error) {
      fail(error as Error & { code?: string });
    }
  }

  let provenance: SessionProvenance = { sessionId: null, source: null };
  try {
    provenance = resolveSessionProvenance({
      explicitSessionId: args.values['session-id'],
      hookSessionId,
      envSessionId: process.env[CLAUDE_CODE_SESSION_ENV],
    });
    if (!provenance.sessionId) {
      const armed = await resolveArmedAssociation(vaultPath, inboxSubdir);
      if (armed.warning) {
        console.error(`  Note: ${armed.warning}`);
      }
      if (armed.sessionId) {
        provenance = { sessionId: armed.sessionId, source: 'armed' };
      }
    }
  } catch (error) {
    fail(error as Error & { code?: string });
  }

  const screenshotPath = args.positionals[0];
  const config: CaptureConfig = {
    vaultPath,
    inboxSubdir,
    skipOpen: args.values['skip-open'],
    action: action as CaptureAction,
    sessionId: provenance.sessionId,
    sessionIdSource: provenance.source,
  };

  try {
    const result = await captureScreenshot(screenshotPath, config);
    
    console.log('✓ Capture successful');
    console.log(`  Action: ${action}`);
    console.log(`  Image saved: ${result.imagePath}`);
    console.log(`  Card saved: ${result.cardPath}`);
    if (result.sessionId) {
      console.log(`  Claude Code session: ${result.sessionId} (${provenance.source ?? 'card'})`);
    } else {
      console.log('  Claude Code session: none (source-less capture)');
    }
    
    if (config.skipOpen) {
      console.log('  Obsidian open: skipped');
    } else if (result.opened) {
      console.log('  Obsidian open: URI launched (verify manually that Obsidian opened)');
    } else {
      console.log('  Obsidian open: URI launch attempted but failed');
      console.error('  Note: This may happen if Obsidian is not installed or the URI protocol is not registered');
    }
    
    process.exit(0);
  } catch (error) {
    fail(error as Error & { code?: string });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
