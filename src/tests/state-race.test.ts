import { test, describe } from 'node:test';
import assert from 'node:assert';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { writeState, setCurrentTarget } from '../state.js';
import type { CaptureState } from '../state.js';

describe('State Write Race Conditions', () => {
  const testDir = join(process.cwd(), 'test-temp-state-race');

  test('concurrent writeState - no ENOENT on rename', async () => {
    const vaultPath = join(testDir, 'vault-race-1');
    await mkdir(vaultPath, { recursive: true });

    const state: CaptureState = {
      version: '1.0.0',
      currentTarget: {
        cardPath: join(vaultPath, 'inbox', 'test.md'),
        imagePath: join(vaultPath, 'inbox', 'test.png'),
        timestamp: new Date().toISOString(),
        vault: vaultPath,
        inbox: 'inbox',
      },
    };

    // Fire 10 concurrent writeState operations
    const writes = Array.from({ length: 10 }, (_, i) => 
      writeState(vaultPath, 'inbox', {
        ...state,
        currentTarget: {
          ...state.currentTarget!,
          cardPath: join(vaultPath, 'inbox', `test-${i}.md`),
        },
      })
    );

    // All should succeed without ENOENT errors
    await assert.doesNotReject(async () => {
      await Promise.all(writes);
    }, 'Concurrent writes should not cause ENOENT errors');

    await rm(testDir, { recursive: true, force: true });
  });

  test('concurrent writeState - no leftover temp files', async () => {
    const vaultPath = join(testDir, 'vault-race-2');
    await mkdir(vaultPath, { recursive: true });

    const state: CaptureState = {
      version: '1.0.0',
      currentTarget: {
        cardPath: join(vaultPath, 'inbox', 'test.md'),
        imagePath: join(vaultPath, 'inbox', 'test.png'),
        timestamp: new Date().toISOString(),
        vault: vaultPath,
        inbox: 'inbox',
      },
    };

    // Fire 20 concurrent writes
    await Promise.all(
      Array.from({ length: 20 }, () => writeState(vaultPath, 'inbox', state))
    );

    // Check for temp files
    const stateDir = join(vaultPath, 'inbox', '.capture-inbox-state');
    const files = await readdir(stateDir);
    
    // Should only have the final state file and lock file (if present)
    const tempFiles = files.filter(f => f.includes('.tmp'));
    assert.strictEqual(tempFiles.length, 0, 
      `Should not have leftover temp files, found: ${tempFiles.join(', ')}`);

    await rm(testDir, { recursive: true, force: true });
  });

  test('concurrent setCurrentTarget - all succeed', async () => {
    const vaultPath = join(testDir, 'vault-race-3');
    const inboxPath = join(vaultPath, 'inbox');
    await mkdir(inboxPath, { recursive: true });

    // Fire 15 concurrent setCurrentTarget calls
    const targets = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        setCurrentTarget(
          vaultPath,
          'inbox',
          join(inboxPath, `card-${i}.md`),
          join(inboxPath, `image-${i}.png`)
        )
      )
    );

    // All should complete successfully
    assert.strictEqual(targets.length, 15);

    // No temp files should remain
    const stateDir = join(vaultPath, 'inbox', '.capture-inbox-state');
    const files = await readdir(stateDir);
    const tempFiles = files.filter(f => f.includes('.tmp'));
    assert.strictEqual(tempFiles.length, 0);

    await rm(testDir, { recursive: true, force: true });
  });

  test('writeState error handling - cleans up temp file', async () => {
    const vaultPath = join(testDir, 'vault-race-4');
    await mkdir(vaultPath, { recursive: true });

    // Create state with invalid path to trigger rename error
    const state: CaptureState = {
      version: '1.0.0',
      currentTarget: {
        cardPath: '/nonexistent/path/test.md',
        imagePath: '/nonexistent/path/test.png',
        timestamp: new Date().toISOString(),
        vault: '/nonexistent',
        inbox: 'inbox',
      },
    };

    // This should fail, but temp file should be cleaned up
    try {
      await writeState(vaultPath, 'inbox', state);
      assert.fail('Should have thrown error');
    } catch (error: any) {
      // Expected to fail
      assert.ok(error);
    }

    // Check no temp files remain
    const stateDir = join(vaultPath, 'inbox', '.capture-inbox-state');
    const files = await readdir(stateDir);
    const tempFiles = files.filter(f => f.includes('.tmp'));
    assert.strictEqual(tempFiles.length, 0, 
      'Temp files should be cleaned up on error');

    await rm(testDir, { recursive: true, force: true });
  });

  test('rapid sequential writeState - no races', async () => {
    const vaultPath = join(testDir, 'vault-race-5');
    await mkdir(vaultPath, { recursive: true });

    // Rapid sequential writes (simulating very fast user captures)
    for (let i = 0; i < 30; i++) {
      const state: CaptureState = {
        version: '1.0.0',
        currentTarget: {
          cardPath: join(vaultPath, 'inbox', `card-${i}.md`),
          imagePath: join(vaultPath, 'inbox', `image-${i}.png`),
          timestamp: new Date().toISOString(),
          vault: vaultPath,
          inbox: 'inbox',
        },
      };

      await writeState(vaultPath, 'inbox', state);
    }

    // No temp files should remain
    const stateDir = join(vaultPath, 'inbox', '.capture-inbox-state');
    const files = await readdir(stateDir);
    const tempFiles = files.filter(f => f.includes('.tmp'));
    assert.strictEqual(tempFiles.length, 0);

    await rm(testDir, { recursive: true, force: true });
  });
});
