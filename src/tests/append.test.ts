import { test, describe } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, readFile, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { captureScreenshot } from '../capture.js';
import type { CaptureConfig } from '../types.js';

describe('Append Action', () => {
  const testDir = join(process.cwd(), 'test-temp-append');
  const fixturesDir = join(process.cwd(), 'fixtures');

  test('append - adds screenshot to current target card', async () => {
    const vaultPath = join(testDir, 'vault-append-1');
    await mkdir(vaultPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');
    const config: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create',
    };

    // Create first card
    const result1 = await captureScreenshot(screenshotPath, config);
    const cardContent1 = await readFile(result1.cardPath, 'utf-8');
    
    // Verify first card has one image
    const imageMatches1 = cardContent1.match(/!\[Screenshot\]/g);
    assert.strictEqual(imageMatches1?.length, 1);

    // Append to the same card
    const configAppend: CaptureConfig = {
      ...config,
      action: 'append',
    };
    const result2 = await captureScreenshot(screenshotPath, configAppend);

    // Should use the same card
    assert.strictEqual(result2.cardPath, result1.cardPath);
    assert.notStrictEqual(result2.imagePath, result1.imagePath);

    // Verify card now has two images
    const cardContent2 = await readFile(result2.cardPath, 'utf-8');
    const imageMatches2 = cardContent2.match(/!\[Screenshot\]/g);
    assert.strictEqual(imageMatches2?.length, 2);

    await rm(testDir, { recursive: true, force: true });
  });

  test('append - multiple appends to same card', async () => {
    const vaultPath = join(testDir, 'vault-append-2');
    await mkdir(vaultPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');
    const createConfig: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create',
    };

    // Create initial card
    const result1 = await captureScreenshot(screenshotPath, createConfig);

    const appendConfig: CaptureConfig = {
      ...createConfig,
      action: 'append',
    };

    // Append three more screenshots
    const result2 = await captureScreenshot(screenshotPath, appendConfig);
    const result3 = await captureScreenshot(screenshotPath, appendConfig);
    const result4 = await captureScreenshot(screenshotPath, appendConfig);

    // All appends should use the same card
    assert.strictEqual(result2.cardPath, result1.cardPath);
    assert.strictEqual(result3.cardPath, result1.cardPath);
    assert.strictEqual(result4.cardPath, result1.cardPath);

    // Verify all image paths are unique
    const imagePaths = [result1.imagePath, result2.imagePath, result3.imagePath, result4.imagePath];
    const uniquePaths = new Set(imagePaths);
    assert.strictEqual(uniquePaths.size, 4);

    // Verify card has four images
    const cardContent = await readFile(result1.cardPath, 'utf-8');
    const imageMatches = cardContent.match(/!\[Screenshot\]/g);
    assert.strictEqual(imageMatches?.length, 4);

    await rm(testDir, { recursive: true, force: true });
  });

  test('append - preserves user edits in card', async () => {
    const vaultPath = join(testDir, 'vault-append-3');
    await mkdir(vaultPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');
    const config: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create',
    };

    // Create initial card
    const result1 = await captureScreenshot(screenshotPath, config);

    // Simulate user editing the card
    let cardContent = await readFile(result1.cardPath, 'utf-8');
    cardContent = cardContent.replace('# Capture', '# My Custom Title\n\nUser added text here');
    await writeFile(result1.cardPath, cardContent, 'utf-8');

    // Append a screenshot
    const appendConfig: CaptureConfig = {
      ...config,
      action: 'append',
    };
    await captureScreenshot(screenshotPath, appendConfig);

    // Verify user edits are preserved
    const finalContent = await readFile(result1.cardPath, 'utf-8');
    assert.ok(finalContent.includes('# My Custom Title'));
    assert.ok(finalContent.includes('User added text here'));

    // Verify new image was added
    const imageMatches = finalContent.match(/!\[Screenshot\]/g);
    assert.strictEqual(imageMatches?.length, 2);

    await rm(testDir, { recursive: true, force: true });
  });

  test('append - fails when no target card exists', async () => {
    const vaultPath = join(testDir, 'vault-append-4');
    await mkdir(vaultPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');
    const config: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'append',
    };

    // Try to append without creating first
    await assert.rejects(
      async () => await captureScreenshot(screenshotPath, config),
      (err: any) => err.code === 'NO_TARGET'
    );

    await rm(testDir, { recursive: true, force: true });
  });

  test('append - fails when target card is deleted', async () => {
    const vaultPath = join(testDir, 'vault-append-5');
    await mkdir(vaultPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');
    const createConfig: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create',
    };

    // Create initial card
    const result1 = await captureScreenshot(screenshotPath, createConfig);

    // Delete the card
    await unlink(result1.cardPath);

    // Try to append
    const appendConfig: CaptureConfig = {
      ...createConfig,
      action: 'append',
    };

    await assert.rejects(
      async () => await captureScreenshot(screenshotPath, appendConfig),
      (err: any) => err.code === 'TARGET_MISSING'
    );

    await rm(testDir, { recursive: true, force: true });
  });

  test('append - target isolation per vault', async () => {
    const vault1Path = join(testDir, 'vault-append-6a');
    const vault2Path = join(testDir, 'vault-append-6b');
    await mkdir(vault1Path, { recursive: true });
    await mkdir(vault2Path, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');

    // Create card in vault 1
    const config1: CaptureConfig = {
      vaultPath: vault1Path,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create',
    };
    const result1 = await captureScreenshot(screenshotPath, config1);

    // Try to append in vault 2 (different vault, should fail)
    const config2: CaptureConfig = {
      vaultPath: vault2Path,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'append',
    };

    await assert.rejects(
      async () => await captureScreenshot(screenshotPath, config2),
      (err: any) => err.code === 'NO_TARGET'
    );

    await rm(testDir, { recursive: true, force: true });
  });

  test('append - target isolation per inbox subdirectory', async () => {
    const vaultPath = join(testDir, 'vault-append-7');
    await mkdir(vaultPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');

    // Create card in inbox1
    const config1: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox1',
      skipOpen: true,
      action: 'create',
    };
    await captureScreenshot(screenshotPath, config1);

    // Try to append in inbox2 (different inbox, should fail)
    const config2: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox2',
      skipOpen: true,
      action: 'append',
    };

    await assert.rejects(
      async () => await captureScreenshot(screenshotPath, config2),
      (err: any) => err.code === 'NO_TARGET'
    );

    await rm(testDir, { recursive: true, force: true });
  });

  test('append - handles Chinese filenames', async () => {
    const vaultPath = join(testDir, 'vault-append-8');
    await mkdir(vaultPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image-cn-文件.png');
    const createConfig: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create',
    };

    // Create initial card
    const result1 = await captureScreenshot(screenshotPath, createConfig);

    // Append screenshot
    const appendConfig: CaptureConfig = {
      ...createConfig,
      action: 'append',
    };
    const result2 = await captureScreenshot(screenshotPath, appendConfig);

    assert.strictEqual(result2.cardPath, result1.cardPath);

    // Verify both images exist
    const cardContent = await readFile(result2.cardPath, 'utf-8');
    const imageMatches = cardContent.match(/!\[Screenshot\]/g);
    assert.strictEqual(imageMatches?.length, 2);

    await rm(testDir, { recursive: true, force: true });
  });

  test('append - handles paths with spaces', async () => {
    const vaultPath = join(testDir, 'vault with spaces');
    await mkdir(vaultPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');
    const createConfig: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox folder',
      skipOpen: true,
      action: 'create',
    };

    // Create initial card
    const result1 = await captureScreenshot(screenshotPath, createConfig);

    // Append screenshot
    const appendConfig: CaptureConfig = {
      ...createConfig,
      action: 'append',
    };
    const result2 = await captureScreenshot(screenshotPath, appendConfig);

    assert.strictEqual(result2.cardPath, result1.cardPath);
    assert.ok(result2.cardPath.includes('vault with spaces'));
    assert.ok(result2.cardPath.includes('inbox folder'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('append - preserves image order', async () => {
    const vaultPath = join(testDir, 'vault-append-9');
    await mkdir(vaultPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');
    const createConfig: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create',
    };

    // Create initial card
    const result1 = await captureScreenshot(screenshotPath, createConfig);
    const image1Name = result1.imagePath.split(/[\\/]/).pop();

    // Append two more screenshots
    const appendConfig: CaptureConfig = {
      ...createConfig,
      action: 'append',
    };
    const result2 = await captureScreenshot(screenshotPath, appendConfig);
    const image2Name = result2.imagePath.split(/[\\/]/).pop();

    const result3 = await captureScreenshot(screenshotPath, appendConfig);
    const image3Name = result3.imagePath.split(/[\\/]/).pop();

    // Read card and verify image order
    const cardContent = await readFile(result1.cardPath, 'utf-8');
    const index1 = cardContent.indexOf(image1Name!);
    const index2 = cardContent.indexOf(image2Name!);
    const index3 = cardContent.indexOf(image3Name!);

    // Images should appear in order they were added
    assert.ok(index1 < index2);
    assert.ok(index2 < index3);

    await rm(testDir, { recursive: true, force: true });
  });

  test('append - inserts before OCR section', async () => {
    const vaultPath = join(testDir, 'vault-append-10');
    await mkdir(vaultPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');
    const createConfig: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create',
    };

    // Create initial card
    const result1 = await captureScreenshot(screenshotPath, createConfig);

    // Append screenshot
    const appendConfig: CaptureConfig = {
      ...createConfig,
      action: 'append',
    };
    const result2 = await captureScreenshot(screenshotPath, appendConfig);

    // Verify new image is inserted before OCR section
    const cardContent = await readFile(result2.cardPath, 'utf-8');
    const ocrIndex = cardContent.indexOf('## OCR Text');
    const image2Name = result2.imagePath.split(/[\\/]/).pop();
    const image2Index = cardContent.indexOf(image2Name!);

    assert.ok(image2Index < ocrIndex, 'New image should be before OCR section');

    await rm(testDir, { recursive: true, force: true });
  });

  test('append - handles card with OCR section removed', async () => {
    const vaultPath = join(testDir, 'vault-append-11');
    await mkdir(vaultPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');
    const createConfig: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create',
    };

    // Create initial card
    const result1 = await captureScreenshot(screenshotPath, createConfig);

    // User removes OCR and AI Summary sections
    let cardContent = await readFile(result1.cardPath, 'utf-8');
    cardContent = cardContent.split('## OCR Text')[0].trimEnd();
    await writeFile(result1.cardPath, cardContent, 'utf-8');

    // Append screenshot
    const appendConfig: CaptureConfig = {
      ...createConfig,
      action: 'append',
    };
    const result2 = await captureScreenshot(screenshotPath, appendConfig);

    // Verify append succeeded and image was added at end
    const finalContent = await readFile(result2.cardPath, 'utf-8');
    const imageMatches = finalContent.match(/!\[Screenshot\]/g);
    assert.strictEqual(imageMatches?.length, 2);

    // Should not have OCR section anymore
    assert.ok(!finalContent.includes('## OCR Text'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('append - rapid consecutive appends', async () => {
    const vaultPath = join(testDir, 'vault-append-12');
    await mkdir(vaultPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');
    const createConfig: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create',
    };

    // Create initial card
    const result1 = await captureScreenshot(screenshotPath, createConfig);

    // Rapid consecutive appends (sequential to avoid file write race conditions)
    const appendConfig: CaptureConfig = {
      ...createConfig,
      action: 'append',
    };

    const result2 = await captureScreenshot(screenshotPath, appendConfig);
    const result3 = await captureScreenshot(screenshotPath, appendConfig);
    const result4 = await captureScreenshot(screenshotPath, appendConfig);

    const results = [result2, result3, result4];

    // All should use the same card
    assert.ok(results.every(r => r.cardPath === result1.cardPath));

    // All image paths should be unique
    const allImages = [result1.imagePath, ...results.map(r => r.imagePath)];
    const uniqueImages = new Set(allImages);
    assert.strictEqual(uniqueImages.size, 4);

    // Verify card has all four images
    const cardContent = await readFile(result1.cardPath, 'utf-8');
    const imageMatches = cardContent.match(/!\[Screenshot\]/g);
    assert.strictEqual(imageMatches?.length, 4);

    await rm(testDir, { recursive: true, force: true });
  });

  test('create - new create action updates target', async () => {
    const vaultPath = join(testDir, 'vault-append-13');
    await mkdir(vaultPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');
    const createConfig: CaptureConfig = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create',
    };

    // Create first card
    const result1 = await captureScreenshot(screenshotPath, createConfig);

    // Create second card (new target)
    const result2 = await captureScreenshot(screenshotPath, createConfig);
    assert.notStrictEqual(result2.cardPath, result1.cardPath);

    // Append should go to the second card
    const appendConfig: CaptureConfig = {
      ...createConfig,
      action: 'append',
    };
    const result3 = await captureScreenshot(screenshotPath, appendConfig);
    assert.strictEqual(result3.cardPath, result2.cardPath);

    await rm(testDir, { recursive: true, force: true });
  });
});
