import { test, describe } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  readState,
  writeState,
  setCurrentTarget,
  getCurrentTarget,
  validateTargetForAppend,
} from '../state.js';
import type { CaptureState } from '../state.js';

describe('State Management', () => {
  const testDir = join(process.cwd(), 'test-temp-state');

  test('readState - returns empty state when file does not exist', async () => {
    const vaultPath = join(testDir, 'vault1');
    await mkdir(vaultPath, { recursive: true });

    const state = await readState(vaultPath, 'inbox');

    assert.strictEqual(state.version, '1.0.0');
    assert.strictEqual(state.currentTarget, null);

    await rm(testDir, { recursive: true, force: true });
  });

  test('writeState and readState - persists state correctly', async () => {
    const vaultPath = join(testDir, 'vault2');
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

    await writeState(vaultPath, 'inbox', state);
    const readBack = await readState(vaultPath, 'inbox');

    assert.deepStrictEqual(readBack, state);

    await rm(testDir, { recursive: true, force: true });
  });

  test('setCurrentTarget - creates state file with correct structure', async () => {
    const vaultPath = join(testDir, 'vault3');
    const inboxPath = join(vaultPath, 'inbox');
    await mkdir(inboxPath, { recursive: true });

    const cardPath = join(inboxPath, 'card.md');
    const imagePath = join(inboxPath, 'image.png');
    
    await writeFile(cardPath, 'test content', 'utf-8');
    await writeFile(imagePath, 'test image', 'utf-8');

    await setCurrentTarget(vaultPath, 'inbox', cardPath, imagePath);

    const state = await readState(vaultPath, 'inbox');

    assert.strictEqual(state.version, '1.0.0');
    assert.ok(state.currentTarget);
    assert.strictEqual(state.currentTarget.cardPath, cardPath);
    assert.strictEqual(state.currentTarget.imagePath, imagePath);
    assert.strictEqual(state.currentTarget.vault, vaultPath);
    assert.strictEqual(state.currentTarget.inbox, 'inbox');
    assert.ok(state.currentTarget.timestamp);

    await rm(testDir, { recursive: true, force: true });
  });

  test('getCurrentTarget - returns null when no target set', async () => {
    const vaultPath = join(testDir, 'vault4');
    await mkdir(vaultPath, { recursive: true });

    const target = await getCurrentTarget(vaultPath, 'inbox');

    assert.strictEqual(target, null);

    await rm(testDir, { recursive: true, force: true });
  });

  test('getCurrentTarget - returns target when valid', async () => {
    const vaultPath = join(testDir, 'vault5');
    const inboxPath = join(vaultPath, 'inbox');
    await mkdir(inboxPath, { recursive: true });

    const cardPath = join(inboxPath, 'card.md');
    const imagePath = join(inboxPath, 'image.png');
    
    await writeFile(cardPath, 'test content', 'utf-8');
    await writeFile(imagePath, 'test image', 'utf-8');

    await setCurrentTarget(vaultPath, 'inbox', cardPath, imagePath);

    const target = await getCurrentTarget(vaultPath, 'inbox');

    assert.ok(target);
    assert.strictEqual(target.cardPath, cardPath);
    assert.strictEqual(target.imagePath, imagePath);

    await rm(testDir, { recursive: true, force: true });
  });

  test('getCurrentTarget - returns null when card file deleted', async () => {
    const vaultPath = join(testDir, 'vault6');
    const inboxPath = join(vaultPath, 'inbox');
    await mkdir(inboxPath, { recursive: true });

    const cardPath = join(inboxPath, 'card.md');
    const imagePath = join(inboxPath, 'image.png');
    
    await writeFile(cardPath, 'test content', 'utf-8');
    await writeFile(imagePath, 'test image', 'utf-8');

    await setCurrentTarget(vaultPath, 'inbox', cardPath, imagePath);

    // Delete the card file
    await unlink(cardPath);

    const target = await getCurrentTarget(vaultPath, 'inbox');

    assert.strictEqual(target, null);

    await rm(testDir, { recursive: true, force: true });
  });

  test('getCurrentTarget - returns null for different vault', async () => {
    const vault1Path = join(testDir, 'vault7a');
    const vault2Path = join(testDir, 'vault7b');
    const inbox1Path = join(vault1Path, 'inbox');
    await mkdir(inbox1Path, { recursive: true });
    await mkdir(vault2Path, { recursive: true });

    const cardPath = join(inbox1Path, 'card.md');
    const imagePath = join(inbox1Path, 'image.png');
    
    await writeFile(cardPath, 'test content', 'utf-8');
    await writeFile(imagePath, 'test image', 'utf-8');

    await setCurrentTarget(vault1Path, 'inbox', cardPath, imagePath);

    // Query from different vault
    const target = await getCurrentTarget(vault2Path, 'inbox');

    assert.strictEqual(target, null);

    await rm(testDir, { recursive: true, force: true });
  });

  test('getCurrentTarget - returns null for different inbox', async () => {
    const vaultPath = join(testDir, 'vault8');
    const inbox1Path = join(vaultPath, 'inbox1');
    await mkdir(inbox1Path, { recursive: true });

    const cardPath = join(inbox1Path, 'card.md');
    const imagePath = join(inbox1Path, 'image.png');
    
    await writeFile(cardPath, 'test content', 'utf-8');
    await writeFile(imagePath, 'test image', 'utf-8');

    await setCurrentTarget(vaultPath, 'inbox1', cardPath, imagePath);

    // Query from different inbox
    const target = await getCurrentTarget(vaultPath, 'inbox2');

    assert.strictEqual(target, null);

    await rm(testDir, { recursive: true, force: true });
  });

  test('validateTargetForAppend - throws NO_TARGET when no target set', async () => {
    const vaultPath = join(testDir, 'vault9');
    await mkdir(vaultPath, { recursive: true });

    await assert.rejects(
      async () => await validateTargetForAppend(vaultPath, 'inbox'),
      (err: any) => err.code === 'NO_TARGET'
    );

    await rm(testDir, { recursive: true, force: true });
  });

  test('validateTargetForAppend - throws TARGET_MISSING when card deleted', async () => {
    const vaultPath = join(testDir, 'vault10');
    const inboxPath = join(vaultPath, 'inbox');
    await mkdir(inboxPath, { recursive: true });

    const cardPath = join(inboxPath, 'card.md');
    const imagePath = join(inboxPath, 'image.png');
    
    await writeFile(cardPath, 'test content', 'utf-8');
    await writeFile(imagePath, 'test image', 'utf-8');

    await setCurrentTarget(vaultPath, 'inbox', cardPath, imagePath);

    // Delete the card file
    await unlink(cardPath);

    await assert.rejects(
      async () => await validateTargetForAppend(vaultPath, 'inbox'),
      (err: any) => err.code === 'TARGET_MISSING'
    );

    await rm(testDir, { recursive: true, force: true });
  });

  test('validateTargetForAppend - succeeds when target valid', async () => {
    const vaultPath = join(testDir, 'vault11');
    const inboxPath = join(vaultPath, 'inbox');
    await mkdir(inboxPath, { recursive: true });

    const cardPath = join(inboxPath, 'card.md');
    const imagePath = join(inboxPath, 'image.png');
    
    await writeFile(cardPath, 'test content', 'utf-8');
    await writeFile(imagePath, 'test image', 'utf-8');

    await setCurrentTarget(vaultPath, 'inbox', cardPath, imagePath);

    const target = await validateTargetForAppend(vaultPath, 'inbox');

    assert.ok(target);
    assert.strictEqual(target.cardPath, cardPath);
    assert.strictEqual(target.imagePath, imagePath);

    await rm(testDir, { recursive: true, force: true });
  });

  test('state file - stored in correct location', async () => {
    const vaultPath = join(testDir, 'vault12');
    const inboxPath = join(vaultPath, 'inbox');
    await mkdir(inboxPath, { recursive: true });

    const cardPath = join(inboxPath, 'card.md');
    const imagePath = join(inboxPath, 'image.png');
    
    await writeFile(cardPath, 'test content', 'utf-8');
    await writeFile(imagePath, 'test image', 'utf-8');

    await setCurrentTarget(vaultPath, 'inbox', cardPath, imagePath);

    // Verify state file exists in expected location
    const { access } = await import('node:fs/promises');
    const stateFilePath = join(vaultPath, 'inbox', '.capture-inbox-state', 'current-target.json');
    
    await assert.doesNotReject(async () => {
      await access(stateFilePath);
    });

    await rm(testDir, { recursive: true, force: true });
  });

  test('readState - handles corrupted state file gracefully', async () => {
    const vaultPath = join(testDir, 'vault13');
    const inboxPath = join(vaultPath, 'inbox');
    const stateDir = join(inboxPath, '.capture-inbox-state');
    await mkdir(stateDir, { recursive: true });

    // Write corrupted JSON
    const stateFilePath = join(stateDir, 'current-target.json');
    await writeFile(stateFilePath, 'invalid json {{{', 'utf-8');

    const state = await readState(vaultPath, 'inbox');

    // Should return empty state instead of throwing
    assert.strictEqual(state.version, '1.0.0');
    assert.strictEqual(state.currentTarget, null);

    await rm(testDir, { recursive: true, force: true });
  });

  test('readState - handles version mismatch', async () => {
    const vaultPath = join(testDir, 'vault14');
    const inboxPath = join(vaultPath, 'inbox');
    const stateDir = join(inboxPath, '.capture-inbox-state');
    await mkdir(stateDir, { recursive: true });

    // Write state with different version
    const stateFilePath = join(stateDir, 'current-target.json');
    const oldVersionState = {
      version: '0.9.0',
      currentTarget: null,
    };
    await writeFile(stateFilePath, JSON.stringify(oldVersionState), 'utf-8');

    const state = await readState(vaultPath, 'inbox');

    // Should return empty state with current version
    assert.strictEqual(state.version, '1.0.0');
    assert.strictEqual(state.currentTarget, null);

    await rm(testDir, { recursive: true, force: true });
  });
});
