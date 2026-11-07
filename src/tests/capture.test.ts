import { test, describe } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { captureScreenshot } from '../capture.js';
import type { CaptureConfig } from '../types.js';

describe('Capture', () => {
  const testDir = join(process.cwd(), 'test-temp-capture');
  const fixturesDir = join(process.cwd(), 'fixtures');

  test('captureScreenshot - creates image and card files', async () => {
    const vaultPath = join(testDir, 'vault');
    await mkdir(vaultPath, { recursive: true });
    
    const screenshotPath = join(fixturesDir, 'test-image.png');
    const config: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
    };

    const result = await captureScreenshot(screenshotPath, config);

    assert.ok(result.imagePath);
    assert.ok(result.cardPath);
    assert.strictEqual(result.opened, false);

    const imageContent = await readFile(result.imagePath);
    const originalContent = await readFile(screenshotPath);
    assert.deepStrictEqual(imageContent, originalContent);

    const cardContent = await readFile(result.cardPath, 'utf-8');
    assert.ok(cardContent.includes('# Capture'));
    assert.ok(cardContent.includes('![Screenshot]'));
    assert.ok(cardContent.includes('## OCR Text'));
    assert.ok(cardContent.includes('*Not yet implemented*'));
    assert.ok(cardContent.includes('## AI Summary'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('captureScreenshot - handles custom inbox subdirectory', async () => {
    const vaultPath = join(testDir, 'vault2');
    await mkdir(vaultPath, { recursive: true });
    
    const screenshotPath = join(fixturesDir, 'test-image.png');
    const config: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'daily/captures',
      skipOpen: true,
    };

    const result = await captureScreenshot(screenshotPath, config);

    assert.ok(result.imagePath.includes('daily'));
    assert.ok(result.imagePath.includes('captures'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('captureScreenshot - prevents filename collisions', async () => {
    const vaultPath = join(testDir, 'vault3');
    const inboxPath = join(vaultPath, 'inbox');
    await mkdir(inboxPath, { recursive: true });
    
    const screenshotPath = join(fixturesDir, 'test-image.png');
    const config: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
    };

    const result1 = await captureScreenshot(screenshotPath, config);
    const result2 = await captureScreenshot(screenshotPath, config);

    assert.notStrictEqual(result1.imagePath, result2.imagePath);
    assert.notStrictEqual(result1.cardPath, result2.cardPath);

    const image1Content = await readFile(result1.imagePath);
    const image2Content = await readFile(result2.imagePath);
    assert.deepStrictEqual(image1Content, image2Content);

    await rm(testDir, { recursive: true, force: true });
  });

  test('captureScreenshot - handles filenames with Chinese characters', async () => {
    const vaultPath = join(testDir, 'vault4');
    await mkdir(vaultPath, { recursive: true });
    
    const screenshotPath = join(fixturesDir, 'test-image-cn-文件.png');
    const config: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
    };

    const result = await captureScreenshot(screenshotPath, config);

    assert.ok(result.imagePath);
    assert.ok(result.cardPath);

    const imageContent = await readFile(result.imagePath);
    assert.ok(imageContent.length > 0);

    await rm(testDir, { recursive: true, force: true });
  });

  test('captureScreenshot - handles paths with spaces', async () => {
    const vaultPath = join(testDir, 'my vault with spaces');
    await mkdir(vaultPath, { recursive: true });
    
    const screenshotPath = join(fixturesDir, 'test-image.png');
    const config: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox folder',
      skipOpen: true,
    };

    const result = await captureScreenshot(screenshotPath, config);

    assert.ok(result.imagePath.includes('my vault with spaces'));
    assert.ok(result.imagePath.includes('inbox folder'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('captureScreenshot - preserves original image bytes', async () => {
    const vaultPath = join(testDir, 'vault5');
    await mkdir(vaultPath, { recursive: true });
    
    const screenshotPath = join(fixturesDir, 'test-image.png');
    const config: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
    };

    const originalContent = await readFile(screenshotPath);
    const result = await captureScreenshot(screenshotPath, config);
    const savedContent = await readFile(result.imagePath);

    assert.deepStrictEqual(savedContent, originalContent);

    await rm(testDir, { recursive: true, force: true });
  });

  test('captureScreenshot - card embeds relative image path', async () => {
    const vaultPath = join(testDir, 'vault6');
    await mkdir(vaultPath, { recursive: true });
    
    const screenshotPath = join(fixturesDir, 'test-image.png');
    const config: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
    };

    const result = await captureScreenshot(screenshotPath, config);
    const cardContent = await readFile(result.cardPath, 'utf-8');

    const imageName = result.imagePath.split(/[\\/]/).pop();
    assert.ok(cardContent.includes(`![Screenshot](${imageName})`));

    await rm(testDir, { recursive: true, force: true });
  });

  test('captureScreenshot - throws error for non-existent screenshot', async () => {
    const vaultPath = join(testDir, 'vault7');
    await mkdir(vaultPath, { recursive: true });
    
    const screenshotPath = join(testDir, 'nonexistent.png');
    const config: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
    };

    await assert.rejects(
      async () => await captureScreenshot(screenshotPath, config),
      (err: any) => err.code === 'FILE_NOT_FOUND'
    );

    await rm(testDir, { recursive: true, force: true });
  });

  test('captureScreenshot - throws error for non-existent vault', async () => {
    const vaultPath = join(testDir, 'nonexistent-vault');
    const screenshotPath = join(fixturesDir, 'test-image.png');
    const config: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
    };

    await assert.rejects(
      async () => await captureScreenshot(screenshotPath, config),
      (err: any) => err.code === 'VAULT_NOT_FOUND'
    );

    await rm(testDir, { recursive: true, force: true });
  });

  test('captureScreenshot - rejects relative screenshot path', async () => {
    const vaultPath = join(testDir, 'vault8');
    await mkdir(vaultPath, { recursive: true });
    
    const screenshotPath = 'relative/path.png';
    const config: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
    };

    await assert.rejects(
      async () => await captureScreenshot(screenshotPath, config),
      (err: any) => err.code === 'RELATIVE_PATH'
    );

    await rm(testDir, { recursive: true, force: true });
  });

  test('captureScreenshot - rejects relative vault path', async () => {
    const vaultPath = 'relative/vault';
    const screenshotPath = join(fixturesDir, 'test-image.png');
    const config: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
    };

    await assert.rejects(
      async () => await captureScreenshot(screenshotPath, config),
      (err: any) => err.code === 'RELATIVE_PATH'
    );
  });

  test('captureScreenshot - rejects path traversal in inbox subdir', async () => {
    const vaultPath = join(testDir, 'vault9');
    await mkdir(vaultPath, { recursive: true });
    
    const screenshotPath = join(fixturesDir, 'test-image.png');
    const config: CaptureConfig = {
      vaultPath,
      inboxSubdir: '../../etc',
      skipOpen: true,
    };

    await assert.rejects(
      async () => await captureScreenshot(screenshotPath, config),
      (err: any) => err.code === 'PATH_ESCAPE'
    );

    await rm(testDir, { recursive: true, force: true });
  });

  test('captureScreenshot - creates inbox directory if missing', async () => {
    const vaultPath = join(testDir, 'vault10');
    await mkdir(vaultPath, { recursive: true });
    
    const screenshotPath = join(fixturesDir, 'test-image.png');
    const config: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'new/nested/inbox',
      skipOpen: true,
    };

    const result = await captureScreenshot(screenshotPath, config);
    assert.ok(result.imagePath.includes('new'));
    assert.ok(result.imagePath.includes('nested'));
    assert.ok(result.imagePath.includes('inbox'));

    await rm(testDir, { recursive: true, force: true });
  });
});
