import { test, describe } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  applyHookEventToRegistry,
  armSession,
  disarmSession,
  readSessionRegistry,
  resolveArmedAssociation,
  writeSessionRegistry,
} from '../session-registry.js';
import { mergeHookSettings, buildHookCommand, HOOK_COMMAND_MARKER } from '../hooks-setup.js';
import { captureScreenshot } from '../capture.js';
import { extractMyNotesSection, MY_NOTES_HEADING } from '../card.js';

function hookJson(sessionId: string, hookEventName: string): string {
  return JSON.stringify({
    session_id: sessionId,
    hook_event_name: hookEventName,
    transcript_path: '/tmp/not-read.jsonl',
  });
}

function cliEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  if (!('CLAUDE_CODE_SESSION_ID' in extra)) {
    delete env.CLAUDE_CODE_SESSION_ID;
  }
  return env;
}

function runCli(
  args: string[],
  options: { env?: NodeJS.ProcessEnv; stdin?: string } = {}
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['bin/capture-inbox.js', ...args], {
      cwd: process.cwd(),
      env: options.env ?? cliEnv(),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    if (options.stdin != null) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('Session association workflow', () => {
  const testDir = join(process.cwd(), 'test-temp-session-assoc');
  const fixturesDir = join(process.cwd(), 'fixtures');
  const screenshot = join(fixturesDir, 'test-image.png');

  test('hooks register liveness but never arm or guess the only live session', async () => {
    const vaultPath = join(testDir, 'vault-only-live');
    await mkdir(vaultPath, { recursive: true });

    await applyHookEventToRegistry(vaultPath, 'inbox', hookJson('session-only', 'SessionStart'));
    const armed = await resolveArmedAssociation(vaultPath, 'inbox');
    assert.strictEqual(armed.sessionId, null);
    assert.strictEqual(armed.reason, 'missing');

    const created = await captureScreenshot(screenshot, {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
    });
    const card = await readFile(created.cardPath, 'utf-8');
    assert.ok(!card.includes('claudeCodeSessionId:'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('explicit arm then ShareX-equivalent create stamps that ID', async () => {
    const vaultPath = join(testDir, 'vault-arm-create');
    await mkdir(vaultPath, { recursive: true });

    await applyHookEventToRegistry(vaultPath, 'inbox', hookJson('session-a', 'SessionStart'));
    await armSession(vaultPath, 'inbox', 'session-a');

    const assoc = await resolveArmedAssociation(vaultPath, 'inbox');
    assert.strictEqual(assoc.sessionId, 'session-a');
    assert.strictEqual(assoc.reason, 'armed');

    const created = await captureScreenshot(screenshot, {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      sessionId: assoc.sessionId,
      sessionIdSource: 'armed',
    });
    const card = await readFile(created.cardPath, 'utf-8');
    assert.ok(card.includes('claudeCodeSessionId: "session-a"'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('arming B replaces A; captures do not keep the previous session', async () => {
    const vaultPath = join(testDir, 'vault-switch');
    await mkdir(vaultPath, { recursive: true });

    await applyHookEventToRegistry(vaultPath, 'inbox', hookJson('session-a', 'SessionStart'));
    await applyHookEventToRegistry(vaultPath, 'inbox', hookJson('session-b', 'SessionStart'));
    await armSession(vaultPath, 'inbox', 'session-a');
    await armSession(vaultPath, 'inbox', 'session-b');

    const assoc = await resolveArmedAssociation(vaultPath, 'inbox');
    assert.strictEqual(assoc.sessionId, 'session-b');
    const registry = await readSessionRegistry(vaultPath, 'inbox');
    assert.strictEqual(registry.sessions['session-a'].armed, false);

    await rm(testDir, { recursive: true, force: true });
  });

  test('ended or stale armed session does not stamp an ID', async () => {
    const vaultPath = join(testDir, 'vault-stale');
    await mkdir(vaultPath, { recursive: true });

    await armSession(vaultPath, 'inbox', 'session-a');
    await applyHookEventToRegistry(vaultPath, 'inbox', hookJson('session-a', 'SessionEnd'));
    const afterEnd = await resolveArmedAssociation(vaultPath, 'inbox');
    assert.strictEqual(afterEnd.sessionId, null);
    assert.strictEqual(afterEnd.reason, 'missing');

    await writeSessionRegistry(vaultPath, 'inbox', {
      version: '1.0.0',
      armedSessionId: 'session-ended',
      sessions: {
        'session-ended': {
          sessionId: 'session-ended',
          status: 'ended',
          lastSeen: new Date().toISOString(),
          armed: true,
        },
      },
    });
    const ended = await resolveArmedAssociation(vaultPath, 'inbox');
    assert.strictEqual(ended.sessionId, null);
    assert.strictEqual(ended.reason, 'ended');

    await armSession(vaultPath, 'inbox', 'session-b');
    const registry = await readSessionRegistry(vaultPath, 'inbox');
    registry.sessions['session-b'].lastSeen = new Date(Date.now() - 60_000).toISOString();
    await writeSessionRegistry(vaultPath, 'inbox', registry);
    const stale = await resolveArmedAssociation(vaultPath, 'inbox', { ttlMs: 1000 });
    assert.strictEqual(stale.sessionId, null);
    assert.strictEqual(stale.reason, 'stale');

    await rm(testDir, { recursive: true, force: true });
  });

  test('ambiguous dual armed flags do not pick either ID', async () => {
    const vaultPath = join(testDir, 'vault-amb');
    await mkdir(vaultPath, { recursive: true });
    await writeSessionRegistry(vaultPath, 'inbox', {
      version: '1.0.0',
      armedSessionId: 'session-a',
      sessions: {
        'session-a': { sessionId: 'session-a', status: 'live', lastSeen: new Date().toISOString(), armed: true },
        'session-b': { sessionId: 'session-b', status: 'live', lastSeen: new Date().toISOString(), armed: true },
      },
    });
    const assoc = await resolveArmedAssociation(vaultPath, 'inbox');
    assert.strictEqual(assoc.sessionId, null);
    assert.strictEqual(assoc.reason, 'ambiguous');

    await rm(testDir, { recursive: true, force: true });
  });

  test('vault/inbox isolation: arm in inbox-a does not stamp inbox-b', async () => {
    const vaultPath = join(testDir, 'vault-iso');
    await mkdir(vaultPath, { recursive: true });
    await armSession(vaultPath, 'inbox-a', 'session-a');
    const b = await resolveArmedAssociation(vaultPath, 'inbox-b');
    assert.strictEqual(b.sessionId, null);

    await rm(testDir, { recursive: true, force: true });
  });

  test('e2e CLI: hook then arm then ShareX-equivalent create/append with notes', async () => {
    const vaultPath = join(testDir, 'vault-e2e');
    await mkdir(vaultPath, { recursive: true });

    const start = await runCli(
      ['--hook-event', '--vault-path', vaultPath, '--skip-open'],
      { stdin: hookJson('e2e-session-1', 'SessionStart') }
    );
    assert.strictEqual(start.code, 0, start.stderr);
    assert.ok(start.stdout.includes('session not armed'));

    const unarmed = await runCli([screenshot, '--vault-path', vaultPath, '--skip-open']);
    assert.strictEqual(unarmed.code, 0, unarmed.stderr);
    assert.ok(unarmed.stdout.includes('source-less capture'));

    const arm = await runCli(
      ['--arm', '--vault-path', vaultPath],
      { env: cliEnv({ CLAUDE_CODE_SESSION_ID: 'e2e-session-1' }) }
    );
    assert.strictEqual(arm.code, 0, arm.stderr);
    assert.ok(arm.stdout.includes('e2e-session-1'));

    const created = await runCli([screenshot, '--vault-path', vaultPath, '--skip-open']);
    assert.strictEqual(created.code, 0, created.stderr);
    assert.ok(created.stdout.includes('e2e-session-1'));
    assert.ok(created.stdout.includes('(armed)'));
    const cardMatch = created.stdout.match(/Card saved: (.+)/);
    assert.ok(cardMatch);
    const cardPath = cardMatch[1].trim();
    let card = await readFile(cardPath, 'utf-8');
    assert.ok(card.includes('claudeCodeSessionId: "e2e-session-1"'));

    const typed = 'Keep these notes during append.';
    card = card.replace(`${MY_NOTES_HEADING}\n\n`, `${MY_NOTES_HEADING}\n\n${typed}\n`);
    await writeFile(cardPath, card, 'utf-8');
    const notesBefore = extractMyNotesSection(card);

    const appended = await runCli([
      screenshot,
      '--vault-path',
      vaultPath,
      '--skip-open',
      '--action',
      'append',
    ]);
    assert.strictEqual(appended.code, 0, appended.stderr);
    const after = await readFile(cardPath, 'utf-8');
    assert.strictEqual(extractMyNotesSection(after), notesBefore);
    assert.strictEqual(after.match(/!\[Screenshot\]/g)?.length, 2);
    assert.ok(after.includes('claudeCodeSessionId: "e2e-session-1"'));

    const armOther = await runCli(
      ['--arm', '--vault-path', vaultPath],
      { env: cliEnv({ CLAUDE_CODE_SESSION_ID: 'e2e-session-2' }) }
    );
    assert.strictEqual(armOther.code, 0, armOther.stderr);

    const mismatch = await runCli([
      screenshot,
      '--vault-path',
      vaultPath,
      '--skip-open',
      '--action',
      'append',
    ]);
    assert.strictEqual(mismatch.code, 1);
    assert.ok(mismatch.stderr.includes('different Claude Code session') || mismatch.stderr.includes('does not match'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('e2e CLI: --arm without env or --session-id refuses to guess', async () => {
    const vaultPath = join(testDir, 'vault-no-guess');
    await mkdir(vaultPath, { recursive: true });
    await applyHookEventToRegistry(vaultPath, 'inbox', hookJson('only-live', 'SessionStart'));

    const result = await runCli(['--arm', '--vault-path', vaultPath]);
    assert.strictEqual(result.code, 1);
    assert.ok(result.stderr.includes('Refusing to guess'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('merge-hooks preserves existing handlers and is idempotent', async () => {
    const existing = {
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo keep-me' }] },
        ],
      },
    };
    const command = buildHookCommand({
      nodePath: '/usr/bin/node',
      binPath: '/opt/capture-inbox/bin/capture-inbox.js',
      vaultPath: '/vault',
      inboxSubdir: 'inbox',
    });
    assert.ok(command.includes(HOOK_COMMAND_MARKER));

    const first = mergeHookSettings(existing, command);
    assert.ok(first.added.includes('SessionStart'));
    const pre = (first.settings.hooks as Record<string, unknown>).PreToolUse as unknown[];
    assert.strictEqual(pre.length, 1);

    const second = mergeHookSettings(first.settings, command);
    assert.deepStrictEqual(second.added, []);
    assert.ok(second.skipped.includes('SessionStart'));

    const settingsPath = join(testDir, 'synthetic-settings.json');
    await mkdir(testDir, { recursive: true });
    const merged = await runCli([
      '--merge-hooks',
      '--settings-file',
      settingsPath,
      '--vault-path',
      join(testDir, 'vault-merge'),
    ]);
    assert.strictEqual(merged.code, 0, merged.stderr);
    const disk = JSON.parse(await readFile(settingsPath, 'utf-8'));
    assert.ok(JSON.stringify(disk).includes('--hook-event'));

    const again = await runCli([
      '--merge-hooks',
      '--settings-file',
      settingsPath,
      '--vault-path',
      join(testDir, 'vault-merge'),
    ]);
    assert.strictEqual(again.code, 0, again.stderr);
    assert.ok(again.stdout.includes('Already present'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('disarm returns subsequent ShareX-equivalent creates to source-less', async () => {
    const vaultPath = join(testDir, 'vault-disarm');
    await mkdir(vaultPath, { recursive: true });
    await armSession(vaultPath, 'inbox', 'session-z');
    await disarmSession(vaultPath, 'inbox');
    const assoc = await resolveArmedAssociation(vaultPath, 'inbox');
    assert.strictEqual(assoc.sessionId, null);

    const created = await runCli([screenshot, '--vault-path', vaultPath, '--skip-open']);
    assert.strictEqual(created.code, 0, created.stderr);
    assert.ok(created.stdout.includes('source-less capture'));

    await rm(testDir, { recursive: true, force: true });
  });
});
