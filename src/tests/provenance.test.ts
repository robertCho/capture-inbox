import { test, describe } from 'node:test';
import assert from 'node:assert';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  assertAppendProvenance,
  parseHookSessionId,
  readCardSessionId,
  resolveSessionProvenance,
  validateSessionId,
} from '../provenance.js';
import { captureScreenshot } from '../capture.js';
import { readHookStdin } from '../cli.js';
import type { CaptureConfig } from '../types.js';

describe('Session provenance', () => {
  const testDir = join(process.cwd(), 'test-temp-provenance');
  const fixturesDir = join(process.cwd(), 'fixtures');

  test('source-less when no official sources are present', () => {
    const result = resolveSessionProvenance({});
    assert.strictEqual(result.sessionId, null);
    assert.strictEqual(result.source, null);
  });

  test('does not invent an ID from empty strings', () => {
    const result = resolveSessionProvenance({
      explicitSessionId: '',
      hookSessionId: '',
      envSessionId: '',
    });
    assert.strictEqual(result.sessionId, null);
  });

  test('uses CLAUDE_CODE_SESSION_ID env (official child-process contract)', () => {
    const result = resolveSessionProvenance({
      envSessionId: '550e8400-e29b-41d4-a716-446655440000',
    });
    assert.strictEqual(result.sessionId, '550e8400-e29b-41d4-a716-446655440000');
    assert.strictEqual(result.source, 'env');
  });

  test('uses explicit --session-id', () => {
    const result = resolveSessionProvenance({
      explicitSessionId: 'session-from-cli',
    });
    assert.strictEqual(result.sessionId, 'session-from-cli');
    assert.strictEqual(result.source, 'cli');
  });

  test('uses hook stdin session_id', () => {
    const result = resolveSessionProvenance({
      hookSessionId: 'hook-session-1',
    });
    assert.strictEqual(result.sessionId, 'hook-session-1');
    assert.strictEqual(result.source, 'hook');
  });

  test('accepts matching env and hook IDs', () => {
    const result = resolveSessionProvenance({
      hookSessionId: 'same-id',
      envSessionId: 'same-id',
    });
    assert.strictEqual(result.sessionId, 'same-id');
  });

  test('rejects conflicting official sources instead of picking one', () => {
    assert.throws(
      () =>
        resolveSessionProvenance({
          explicitSessionId: 'session-a',
          envSessionId: 'session-b',
        }),
      (err: any) => err.code === 'SESSION_ID_CONFLICT'
    );
  });

  test('rejects conflicting hook and env IDs', () => {
    assert.throws(
      () =>
        resolveSessionProvenance({
          hookSessionId: 'hook-id',
          envSessionId: 'env-id',
        }),
      (err: any) => err.code === 'SESSION_ID_CONFLICT'
    );
  });

  test('rejects path-like session IDs', () => {
    assert.throws(
      () => validateSessionId('../secret', 'test'),
      (err: any) => err.code === 'INVALID_SESSION_ID'
    );
    assert.throws(
      () => validateSessionId('C:\\Users\\x\\transcript.jsonl', 'test'),
      (err: any) => err.code === 'INVALID_SESSION_ID'
    );
  });

  test('rejects whitespace and empty IDs', () => {
    assert.throws(
      () => validateSessionId('   ', 'test'),
      (err: any) => err.code === 'INVALID_SESSION_ID'
    );
  });

  test('parseHookSessionId reads official session_id and ignores transcript_path', () => {
    const hookJson = JSON.stringify({
      session_id: 'abc123',
      transcript_path: '/home/user/.claude/projects/x/transcript.jsonl',
      hook_event_name: 'PreToolUse',
    });
    assert.strictEqual(parseHookSessionId(hookJson), 'abc123');
  });

  test('parseHookSessionId fails without session_id', () => {
    assert.throws(
      () => parseHookSessionId(JSON.stringify({ hook_event_name: 'Stop' })),
      (err: any) => err.code === 'INVALID_HOOK_INPUT'
    );
  });

  test('parseHookSessionId fails on invalid JSON', () => {
    assert.throws(
      () => parseHookSessionId('not-json'),
      (err: any) => err.code === 'INVALID_HOOK_INPUT'
    );
  });

  test('readHookStdin reads hook JSON from a non-TTY stream', async () => {
    const stream = Readable.from(['{"session_id":"from-stdin"}']);
    const raw = await readHookStdin(stream, 500);
    assert.strictEqual(parseHookSessionId(raw), 'from-stdin');
  });

  test('create stamps official session ID into frontmatter', async () => {
    const vaultPath = join(testDir, 'vault-prov-1');
    await mkdir(vaultPath, { recursive: true });

    const result = await captureScreenshot(join(fixturesDir, 'test-image.png'), {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create',
      sessionId: 'create-session-1',
      sessionIdSource: 'env',
    });

    const card = await readFile(result.cardPath, 'utf-8');
    assert.strictEqual(result.sessionId, 'create-session-1');
    assert.ok(card.includes('claudeCodeSessionId: "create-session-1"'));
    assert.strictEqual(readCardSessionId(card), 'create-session-1');

    await rm(testDir, { recursive: true, force: true });
  });

  test('create without session ID stays source-less', async () => {
    const vaultPath = join(testDir, 'vault-prov-2');
    await mkdir(vaultPath, { recursive: true });

    const result = await captureScreenshot(join(fixturesDir, 'test-image.png'), {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create',
    });

    const card = await readFile(result.cardPath, 'utf-8');
    assert.strictEqual(result.sessionId, null);
    assert.ok(!card.includes('claudeCodeSessionId:'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('append preserves per-card session ID when incoming capture is source-less', async () => {
    const vaultPath = join(testDir, 'vault-prov-3');
    await mkdir(vaultPath, { recursive: true });
    const screenshotPath = join(fixturesDir, 'test-image.png');

    const created = await captureScreenshot(screenshotPath, {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create',
      sessionId: 'card-session',
    });

    const appended = await captureScreenshot(screenshotPath, {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'append',
    });

    const card = await readFile(created.cardPath, 'utf-8');
    assert.strictEqual(appended.sessionId, 'card-session');
    assert.strictEqual(readCardSessionId(card), 'card-session');
    assert.strictEqual(card.match(/claudeCodeSessionId:/g)?.length, 1);

    await rm(testDir, { recursive: true, force: true });
  });

  test('append does not retcon a source-less card with an incoming ID', async () => {
    const vaultPath = join(testDir, 'vault-prov-4');
    await mkdir(vaultPath, { recursive: true });
    const screenshotPath = join(fixturesDir, 'test-image.png');

    const created = await captureScreenshot(screenshotPath, {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create',
    });

    const appended = await captureScreenshot(screenshotPath, {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'append',
      sessionId: 'later-session',
    });

    const card = await readFile(created.cardPath, 'utf-8');
    assert.strictEqual(appended.sessionId, null);
    assert.ok(!card.includes('claudeCodeSessionId:'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('append rejects a different session ID than the card', async () => {
    const vaultPath = join(testDir, 'vault-prov-5');
    await mkdir(vaultPath, { recursive: true });
    const screenshotPath = join(fixturesDir, 'test-image.png');

    await captureScreenshot(screenshotPath, {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create',
      sessionId: 'session-a',
    });

    await assert.rejects(
      async () =>
        await captureScreenshot(screenshotPath, {
          vaultPath,
          inboxSubdir: 'inbox',
          skipOpen: true,
          action: 'append',
          sessionId: 'session-b',
        }),
      (err: any) => err.code === 'SESSION_MISMATCH'
    );

    const attachments = await readdir(join(vaultPath, 'inbox', 'attachments'));
    assert.strictEqual(attachments.length, 1, 'mismatch must not write an orphan attachment');

    await rm(testDir, { recursive: true, force: true });
  });

  test('two inboxes keep independent session provenance', async () => {
    const vaultPath = join(testDir, 'vault-prov-6');
    await mkdir(vaultPath, { recursive: true });
    const screenshotPath = join(fixturesDir, 'test-image.png');

    const a = await captureScreenshot(screenshotPath, {
      vaultPath,
      inboxSubdir: 'inbox-a',
      skipOpen: true,
      sessionId: 'session-a',
    } satisfies CaptureConfig);

    const b = await captureScreenshot(screenshotPath, {
      vaultPath,
      inboxSubdir: 'inbox-b',
      skipOpen: true,
      sessionId: 'session-b',
    });

    assert.strictEqual(readCardSessionId(await readFile(a.cardPath, 'utf-8')), 'session-a');
    assert.strictEqual(readCardSessionId(await readFile(b.cardPath, 'utf-8')), 'session-b');

    await rm(testDir, { recursive: true, force: true });
  });

  test('assertAppendProvenance keeps card ID when incoming is source-less', () => {
    assert.strictEqual(assertAppendProvenance('card-id', null), 'card-id');
  });

  test('assertAppendProvenance does not fill a source-less card', () => {
    assert.strictEqual(assertAppendProvenance(null, 'incoming-id'), null);
  });

  test('user-edited frontmatter session ID is honored on append', async () => {
    const vaultPath = join(testDir, 'vault-prov-7');
    await mkdir(vaultPath, { recursive: true });
    const screenshotPath = join(fixturesDir, 'test-image.png');

    const created = await captureScreenshot(screenshotPath, {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      sessionId: 'original-id',
    });

    const original = await readFile(created.cardPath, 'utf-8');
    await writeFile(
      created.cardPath,
      original.replace('original-id', 'user-edited-id'),
      'utf-8'
    );

    await assert.rejects(
      async () =>
        await captureScreenshot(screenshotPath, {
          vaultPath,
          inboxSubdir: 'inbox',
          skipOpen: true,
          action: 'append',
          sessionId: 'original-id',
        }),
      (err: any) => err.code === 'SESSION_MISMATCH'
    );

    await rm(testDir, { recursive: true, force: true });
  });
});
