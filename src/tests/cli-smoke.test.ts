import { test, describe } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

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
    }
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('CLI smoke', () => {
  const testDir = join(process.cwd(), 'test-temp-cli-smoke');
  const fixturesDir = join(process.cwd(), 'fixtures');
  const screenshot = join(fixturesDir, 'test-image.png');

  test('source-less create via CLI does not stamp a guessed session', async () => {
    const vaultPath = join(testDir, 'vault-smoke-1');
    await mkdir(vaultPath, { recursive: true });

    const result = await runCli([
      screenshot,
      '--vault-path',
      vaultPath,
      '--skip-open',
    ]);

    assert.strictEqual(result.code, 0, result.stderr);
    assert.ok(result.stdout.includes('source-less capture'));
    assert.ok(result.stdout.includes(`${join('inbox', 'attachments')}`) || result.stdout.includes('inbox/attachments') || result.stdout.includes('inbox\\attachments'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('CLI --session-id stamps frontmatter', async () => {
    const vaultPath = join(testDir, 'vault-smoke-2');
    await mkdir(vaultPath, { recursive: true });

    const result = await runCli([
      screenshot,
      '--vault-path',
      vaultPath,
      '--skip-open',
      '--session-id',
      'cli-smoke-session',
    ]);

    assert.strictEqual(result.code, 0, result.stderr);
    assert.ok(result.stdout.includes('cli-smoke-session'));
    const match = result.stdout.match(/Card saved: (.+)/);
    assert.ok(match);
    const card = await readFile(match[1].trim(), 'utf-8');
    assert.ok(card.includes('claudeCodeSessionId: "cli-smoke-session"'));
    assert.ok(card.includes('## My Notes'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('CLI inherits official CLAUDE_CODE_SESSION_ID env', async () => {
    const vaultPath = join(testDir, 'vault-smoke-3');
    await mkdir(vaultPath, { recursive: true });

    const result = await runCli(
      [screenshot, '--vault-path', vaultPath, '--skip-open'],
      { env: cliEnv({ CLAUDE_CODE_SESSION_ID: 'env-smoke-session' }) }
    );

    assert.strictEqual(result.code, 0, result.stderr);
    assert.ok(result.stdout.includes('env-smoke-session'));
    assert.ok(result.stdout.includes('(env)'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('CLI --from-hook uses stdin session_id', async () => {
    const vaultPath = join(testDir, 'vault-smoke-4');
    await mkdir(vaultPath, { recursive: true });

    const result = await runCli(
      [screenshot, '--vault-path', vaultPath, '--skip-open', '--from-hook'],
      {
        stdin: JSON.stringify({
          session_id: 'hook-smoke-session',
          transcript_path: '/tmp/not-read.jsonl',
          hook_event_name: 'PreToolUse',
        }),
      }
    );

    assert.strictEqual(result.code, 0, result.stderr);
    assert.ok(result.stdout.includes('hook-smoke-session'));
    assert.ok(result.stdout.includes('(hook)'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('CLI refuses conflicting env and --session-id', async () => {
    const vaultPath = join(testDir, 'vault-smoke-5');
    await mkdir(vaultPath, { recursive: true });

    const result = await runCli(
      [screenshot, '--vault-path', vaultPath, '--skip-open', '--session-id', 'cli-id'],
      { env: cliEnv({ CLAUDE_CODE_SESSION_ID: 'env-id' }) }
    );

    assert.strictEqual(result.code, 1);
    assert.ok(result.stderr.includes('Conflicting Claude Code session IDs'));

    await rm(testDir, { recursive: true, force: true });
  });
});
