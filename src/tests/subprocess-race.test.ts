import { test, describe } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execCommand = promisify(exec);

describe('Subprocess Race Conditions', () => {
  const testDir = join(process.cwd(), 'test-temp-subprocess');
  const fixturesDir = join(process.cwd(), 'fixtures');

  test('concurrent creates via subprocesses - all succeed', async () => {
    const vaultPath = join(testDir, 'vault-subprocess-1');
    await mkdir(vaultPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');
    const command = `node bin/capture-inbox.js "${screenshotPath}" --vault-path "${vaultPath}" --skip-open --action create`;

    // Spawn 5 concurrent subprocess captures
    const processes = Array.from({ length: 5 }, () => 
      execCommand(command, { cwd: process.cwd() })
    );

    // All should complete successfully
    const results = await Promise.all(processes);
    
    assert.strictEqual(results.length, 5);
    results.forEach(({ stdout, stderr }) => {
      assert.ok(stdout.includes('✓ Capture successful'), 
        `Expected success message, got: ${stdout}`);
      assert.ok(!stderr || stderr.length === 0, 
        `Unexpected stderr: ${stderr}`);
    });

    // Verify no temp files remain
    const stateDir = join(vaultPath, 'inbox', '.capture-inbox-state');
    const files = await readdir(stateDir);
    const tempFiles = files.filter(f => f.includes('.tmp'));
    assert.strictEqual(tempFiles.length, 0, 
      `Should not have temp files, found: ${tempFiles.join(', ')}`);

    await rm(testDir, { recursive: true, force: true });
  });

  test('rapid sequential creates via subprocesses', async () => {
    const vaultPath = join(testDir, 'vault-subprocess-2');
    await mkdir(vaultPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');
    const command = `node bin/capture-inbox.js "${screenshotPath}" --vault-path "${vaultPath}" --skip-open --action create`;

    // Rapid sequential captures
    for (let i = 0; i < 10; i++) {
      const { stdout, stderr } = await execCommand(command, { cwd: process.cwd() });
      assert.ok(stdout.includes('✓ Capture successful'));
      assert.ok(!stderr || stderr.length === 0);
    }

    // Verify no temp files
    const stateDir = join(vaultPath, 'inbox', '.capture-inbox-state');
    const files = await readdir(stateDir);
    const tempFiles = files.filter(f => f.includes('.tmp'));
    assert.strictEqual(tempFiles.length, 0);

    await rm(testDir, { recursive: true, force: true });
  });

  test('mixed concurrent creates and appends via subprocesses', async () => {
    const vaultPath = join(testDir, 'vault-subprocess-3');
    await mkdir(vaultPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');
    const createCmd = `node bin/capture-inbox.js "${screenshotPath}" --vault-path "${vaultPath}" --skip-open --action create`;
    const appendCmd = `node bin/capture-inbox.js "${screenshotPath}" --vault-path "${vaultPath}" --skip-open --action append`;

    // First create
    await execCommand(createCmd, { cwd: process.cwd() });

    // Now fire mixed creates and appends
    const operations = [
      execCommand(appendCmd, { cwd: process.cwd() }),
      execCommand(createCmd, { cwd: process.cwd() }),
      execCommand(appendCmd, { cwd: process.cwd() }),
      execCommand(createCmd, { cwd: process.cwd() }),
      execCommand(appendCmd, { cwd: process.cwd() }),
    ];

    const results = await Promise.all(operations);
    
    // All should succeed
    results.forEach(({ stdout, stderr }) => {
      assert.ok(stdout.includes('✓ Capture successful'));
      assert.ok(!stderr || stderr.length === 0);
    });

    // No temp files
    const stateDir = join(vaultPath, 'inbox', '.capture-inbox-state');
    const files = await readdir(stateDir);
    const tempFiles = files.filter(f => f.includes('.tmp'));
    assert.strictEqual(tempFiles.length, 0);

    await rm(testDir, { recursive: true, force: true });
  });

  test('high-concurrency creates - stress test', async () => {
    const vaultPath = join(testDir, 'vault-subprocess-4');
    await mkdir(vaultPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');
    const command = `node bin/capture-inbox.js "${screenshotPath}" --vault-path "${vaultPath}" --skip-open --action create`;

    // Fire 10 concurrent creates (stress test)
    const processes = Array.from({ length: 10 }, () => 
      execCommand(command, { cwd: process.cwd() })
    );

    const results = await Promise.all(processes);
    
    // All 10 should succeed
    assert.strictEqual(results.length, 10);
    results.forEach(({ stdout }) => {
      assert.ok(stdout.includes('✓ Capture successful'));
    });

    // Verify 10 unique cards created
    const inboxDir = join(vaultPath, 'inbox');
    const allFiles = await readdir(inboxDir);
    const cardFiles = allFiles.filter(f => f.endsWith('.md'));
    assert.strictEqual(cardFiles.length, 10, 
      `Expected 10 cards, got ${cardFiles.length}`);

    // No temp files
    const stateDir = join(vaultPath, 'inbox', '.capture-inbox-state');
    const stateFiles = await readdir(stateDir);
    const tempFiles = stateFiles.filter(f => f.includes('.tmp'));
    assert.strictEqual(tempFiles.length, 0);

    await rm(testDir, { recursive: true, force: true });
  });
});
