import { test, describe } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  validatePath,
  fileExists,
  generateTimestampFilename,
  generateUniqueFilename,
  encodeObsidianUri,
  validateAbsolutePath,
  createError,
} from '../utils.js';

describe('Utils', () => {
  const testDir = join(process.cwd(), 'test-temp-utils');

  test('validatePath - accepts paths within vault', async () => {
    const vaultPath = '/vault';
    const targetPath = '/vault/inbox/file.md';
    assert.doesNotThrow(() => validatePath(targetPath, vaultPath));
  });

  test('validatePath - rejects paths outside vault', async () => {
    const vaultPath = '/vault';
    const targetPath = '/other/file.md';
    assert.throws(
      () => validatePath(targetPath, vaultPath),
      (err: any) => err.code === 'PATH_ESCAPE'
    );
  });

  test('validatePath - rejects relative path traversal', async () => {
    const vaultPath = '/vault';
    const targetPath = '/vault/../etc/passwd';
    assert.throws(
      () => validatePath(targetPath, vaultPath),
      (err: any) => err.code === 'PATH_ESCAPE'
    );
  });

  test('fileExists - returns true for existing file', async () => {
    await mkdir(testDir, { recursive: true });
    const testFile = join(testDir, 'exists.txt');
    await writeFile(testFile, 'content');
    
    const exists = await fileExists(testFile);
    assert.strictEqual(exists, true);
    
    await rm(testDir, { recursive: true, force: true });
  });

  test('fileExists - returns false for non-existing file', async () => {
    const exists = await fileExists('/nonexistent/file.txt');
    assert.strictEqual(exists, false);
  });

  test('generateTimestampFilename - generates valid filename', async () => {
    const filename = generateTimestampFilename('.png');
    assert.match(filename, /^capture_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.png$/);
  });

  test('generateUniqueFilename - generates unique filename on collision', async () => {
    await mkdir(testDir, { recursive: true });
    
    await writeFile(join(testDir, 'test.png'), 'content1');
    await writeFile(join(testDir, 'test_1.png'), 'content2');
    
    const uniqueFilename = await generateUniqueFilename(testDir, 'test', '.png');
    assert.strictEqual(uniqueFilename, 'test_2.png');
    
    await rm(testDir, { recursive: true, force: true });
  });

  test('generateUniqueFilename - returns base name if no collision', async () => {
    await mkdir(testDir, { recursive: true });
    
    const uniqueFilename = await generateUniqueFilename(testDir, 'new', '.png');
    assert.strictEqual(uniqueFilename, 'new.png');
    
    await rm(testDir, { recursive: true, force: true });
  });

  test('encodeObsidianUri - generates valid URI', async () => {
    const vaultPath = '/home/user/MyVault';
    const filePath = '/home/user/MyVault/inbox/note.md';
    const uri = encodeObsidianUri(vaultPath, filePath);
    
    assert.match(uri, /^obsidian:\/\/open\?vault=MyVault&file=inbox%2Fnote\.md$/);
  });

  test('encodeObsidianUri - handles Windows paths', async () => {
    const vaultPath = 'C:\\Users\\User\\MyVault';
    const filePath = 'C:\\Users\\User\\MyVault\\inbox\\note.md';
    const uri = encodeObsidianUri(vaultPath, filePath);
    
    assert.match(uri, /^obsidian:\/\/open\?vault=/);
    assert.ok(uri.includes('inbox'));
    assert.ok(uri.includes('note.md'));
  });

  test('encodeObsidianUri - handles Chinese characters', async () => {
    const vaultPath = '/home/user/我的笔记';
    const filePath = '/home/user/我的笔记/inbox/笔记.md';
    const uri = encodeObsidianUri(vaultPath, filePath);
    
    assert.match(uri, /^obsidian:\/\/open\?vault=/);
    assert.ok(uri.includes('inbox%2F'));
  });

  test('encodeObsidianUri - handles spaces', async () => {
    const vaultPath = '/home/user/My Vault';
    const filePath = '/home/user/My Vault/inbox/my note.md';
    const uri = encodeObsidianUri(vaultPath, filePath);
    
    assert.ok(uri.includes('vault=My%20Vault'));
    assert.ok(uri.includes('inbox%2Fmy%20note.md'));
  });

  test('validateAbsolutePath - accepts absolute paths', async () => {
    assert.doesNotThrow(() => validateAbsolutePath('/absolute/path', 'test'));
  });

  test('validateAbsolutePath - rejects relative paths', async () => {
    assert.throws(
      () => validateAbsolutePath('relative/path', 'test'),
      (err: any) => err.code === 'RELATIVE_PATH'
    );
  });

  test('validateAbsolutePath - rejects empty paths', async () => {
    assert.throws(
      () => validateAbsolutePath('', 'test'),
      (err: any) => err.code === 'MISSING_PATH'
    );
  });

  test('createError - creates error with code', async () => {
    const error = createError('test message', 'TEST_CODE');
    assert.strictEqual(error.message, 'test message');
    assert.strictEqual(error.code, 'TEST_CODE');
  });
});
