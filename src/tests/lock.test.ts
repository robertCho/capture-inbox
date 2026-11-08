import { test, describe } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acquireLock, withLock } from '../lock.js';

describe('Lock Mechanism', () => {
  const testDir = join(process.cwd(), 'test-temp-lock');

  test('acquireLock - successfully acquires lock', async () => {
    const vaultPath = join(testDir, 'vault-lock-1');
    await mkdir(vaultPath, { recursive: true });

    const release = await acquireLock(vaultPath, 'inbox', 'test');
    assert.ok(release, 'Should return release function');

    // Verify lock file exists
    const lockPath = join(vaultPath, 'inbox', '.capture-inbox-state', 'operation.lock');
    const { access } = await import('node:fs/promises');
    await assert.doesNotReject(async () => await access(lockPath));

    // Release lock
    await release();

    await rm(testDir, { recursive: true, force: true });
  });

  test('acquireLock - serializes multiple acquires', async () => {
    const vaultPath = join(testDir, 'vault-lock-2');
    await mkdir(vaultPath, { recursive: true });

    const order: number[] = [];

    // Acquire first lock
    const release1 = await acquireLock(vaultPath, 'inbox', 'op1');
    order.push(1);

    // Start second acquire (should wait)
    const acquire2Promise = acquireLock(vaultPath, 'inbox', 'op2').then(release => {
      order.push(2);
      return release;
    });

    // Give it a moment to try acquiring
    await new Promise(resolve => setTimeout(resolve, 100));

    // Order should still be just [1]
    assert.deepStrictEqual(order, [1]);

    // Release first lock
    await release1();

    // Wait for second to acquire
    const release2 = await acquire2Promise;

    // Order should now be [1, 2]
    assert.deepStrictEqual(order, [1, 2]);

    await release2();

    await rm(testDir, { recursive: true, force: true });
  });

  test('withLock - executes function with lock', async () => {
    const vaultPath = join(testDir, 'vault-lock-3');
    await mkdir(vaultPath, { recursive: true });

    let executed = false;

    const result = await withLock(vaultPath, 'inbox', 'test', async () => {
      executed = true;
      return 42;
    });

    assert.strictEqual(executed, true);
    assert.strictEqual(result, 42);

    await rm(testDir, { recursive: true, force: true });
  });

  test('withLock - releases lock even on error', async () => {
    const vaultPath = join(testDir, 'vault-lock-4');
    await mkdir(vaultPath, { recursive: true });

    try {
      await withLock(vaultPath, 'inbox', 'test', async () => {
        throw new Error('Test error');
      });
      assert.fail('Should have thrown');
    } catch (error: any) {
      assert.strictEqual(error.message, 'Test error');
    }

    // Lock should be released, so we can acquire it again
    const release = await acquireLock(vaultPath, 'inbox', 'test2');
    assert.ok(release);
    await release();

    await rm(testDir, { recursive: true, force: true });
  });

  test('stale lock detection - removes lock older than 30s', async () => {
    const vaultPath = join(testDir, 'vault-lock-5');
    const lockDir = join(vaultPath, 'inbox', '.capture-inbox-state');
    await mkdir(lockDir, { recursive: true });

    // Create stale lock (31 seconds old)
    const lockPath = join(lockDir, 'operation.lock');
    await writeFile(lockPath, JSON.stringify({
      pid: 99999,
      timestamp: Date.now() - 31000,
      operation: 'stale'
    }), 'utf-8');

    // Should be able to acquire despite existing lock
    const release = await acquireLock(vaultPath, 'inbox', 'new-op');
    assert.ok(release);
    await release();

    await rm(testDir, { recursive: true, force: true });
  });

  test('corrupted lock file - treated as stale', async () => {
    const vaultPath = join(testDir, 'vault-lock-6');
    const lockDir = join(vaultPath, 'inbox', '.capture-inbox-state');
    await mkdir(lockDir, { recursive: true });

    // Create corrupted lock
    const lockPath = join(lockDir, 'operation.lock');
    await writeFile(lockPath, 'invalid json {{{', 'utf-8');

    // Should be able to acquire by treating it as stale
    const release = await acquireLock(vaultPath, 'inbox', 'new-op');
    assert.ok(release);
    await release();

    await rm(testDir, { recursive: true, force: true });
  });

  test('independent locks per inbox', async () => {
    const vaultPath = join(testDir, 'vault-lock-7');
    await mkdir(vaultPath, { recursive: true });

    // Acquire lock for inbox1
    const release1 = await acquireLock(vaultPath, 'inbox1', 'op1');

    // Should be able to acquire lock for inbox2 simultaneously
    const release2 = await acquireLock(vaultPath, 'inbox2', 'op2');

    assert.ok(release1);
    assert.ok(release2);

    await release1();
    await release2();

    await rm(testDir, { recursive: true, force: true });
  });

  test('lock release is idempotent', async () => {
    const vaultPath = join(testDir, 'vault-lock-8');
    await mkdir(vaultPath, { recursive: true });

    const release = await acquireLock(vaultPath, 'inbox', 'test');

    // Release multiple times should not error
    await release();
    await release();
    await release();

    await rm(testDir, { recursive: true, force: true });
  });
});
