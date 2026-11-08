import { test, describe } from 'node:test';
import assert from 'node:assert';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  ATTACHMENTS_SUBDIR,
  assertSafeAttachmentFilename,
  attachmentMarkdownRef,
  isUnderAttachmentsDir,
  toMarkdownRelativeRef,
} from '../attachments.js';
import { captureScreenshot } from '../capture.js';
import { setCurrentTarget } from '../state.js';

describe('Attachments and legacy cards', () => {
  const testDir = join(process.cwd(), 'test-temp-attachments');
  const fixturesDir = join(process.cwd(), 'fixtures');

  test('toMarkdownRelativeRef uses POSIX separators and encodes spaces', () => {
    assert.strictEqual(
      toMarkdownRelativeRef('attachments/my file.png'),
      'attachments/my%20file.png'
    );
    assert.strictEqual(
      toMarkdownRelativeRef('attachments\\capture.png'),
      'attachments/capture.png'
    );
  });

  test('toMarkdownRelativeRef keeps unicode and rejects traversal', () => {
    assert.strictEqual(
      toMarkdownRelativeRef('attachments/截图.png'),
      'attachments/截图.png'
    );
    assert.throws(
      () => toMarkdownRelativeRef('../etc/passwd'),
      (err: any) => err.code === 'PATH_ESCAPE'
    );
    assert.throws(
      () => toMarkdownRelativeRef('attachments/../../x.png'),
      (err: any) => err.code === 'PATH_ESCAPE'
    );
  });

  test('attachment filenames cannot be path segments', () => {
    assert.throws(
      () => assertSafeAttachmentFilename('..'),
      (err: any) => err.code === 'PATH_ESCAPE'
    );
    assert.throws(
      () => assertSafeAttachmentFilename('a/b.png'),
      (err: any) => err.code === 'PATH_ESCAPE'
    );
    assert.strictEqual(attachmentMarkdownRef('capture.png'), 'attachments/capture.png');
  });

  test('new create stores image in attachments and card in inbox', async () => {
    const vaultPath = join(testDir, 'vault-att-1');
    await mkdir(vaultPath, { recursive: true });
    const screenshotPath = join(fixturesDir, 'test-image.png');

    const result = await captureScreenshot(screenshotPath, {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
    });

    const inboxPath = join(vaultPath, 'inbox');
    assert.ok(isUnderAttachmentsDir(result.imagePath, inboxPath));
    assert.strictEqual(result.cardPath, join(inboxPath, basename(result.cardPath)));

    const card = await readFile(result.cardPath, 'utf-8');
    const imageName = result.imagePath.split(/[\\/]/).pop();
    assert.ok(card.includes(`![Screenshot](attachments/${imageName})`));
    assert.ok(!card.includes('\\'));

    const inboxFiles = await readdir(inboxPath);
    assert.ok(inboxFiles.includes(ATTACHMENTS_SUBDIR));
    assert.ok(inboxFiles.some((name) => name.endsWith('.md')));
    assert.ok(!inboxFiles.some((name) => name.endsWith('.png')));

    await rm(testDir, { recursive: true, force: true });
  });

  test('append adds a new attachments file and keeps the same card', async () => {
    const vaultPath = join(testDir, 'vault-att-2');
    await mkdir(vaultPath, { recursive: true });
    const screenshotPath = join(fixturesDir, 'test-image.png');

    const created = await captureScreenshot(screenshotPath, {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
    });
    const appended = await captureScreenshot(screenshotPath, {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'append',
    });

    const inboxPath = join(vaultPath, 'inbox');
    assert.strictEqual(appended.cardPath, created.cardPath);
    assert.ok(isUnderAttachmentsDir(created.imagePath, inboxPath));
    assert.ok(isUnderAttachmentsDir(appended.imagePath, inboxPath));
    assert.notStrictEqual(created.imagePath, appended.imagePath);

    const originalBytes = await readFile(screenshotPath);
    assert.deepStrictEqual(await readFile(created.imagePath), originalBytes);
    assert.deepStrictEqual(await readFile(appended.imagePath), originalBytes);

    await rm(testDir, { recursive: true, force: true });
  });

  test('unicode vault and inbox with spaces still get portable refs', async () => {
    const vaultPath = join(testDir, '保险库 vault');
    await mkdir(vaultPath, { recursive: true });

    const result = await captureScreenshot(join(fixturesDir, 'test-image-cn-文件.png'), {
      vaultPath,
      inboxSubdir: '收件 inbox',
      skipOpen: true,
    });

    const card = await readFile(result.cardPath, 'utf-8');
    const imageName = result.imagePath.split(/[\\/]/).pop()!;
    assert.ok(result.cardPath.includes('保险库 vault'));
    assert.ok(result.cardPath.includes('收件 inbox'));
    assert.ok(card.includes(`![Screenshot](attachments/${imageName})`));
    assert.ok(!card.includes('\\'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('legacy flat card stays displayable and appendable without migrating old images', async () => {
    const vaultPath = join(testDir, 'vault-legacy');
    const inboxPath = join(vaultPath, 'inbox');
    await mkdir(inboxPath, { recursive: true });

    const screenshotPath = join(fixturesDir, 'test-image.png');
    const legacyImagePath = join(inboxPath, 'capture_legacy.png');
    const legacyCardPath = join(inboxPath, 'capture_legacy.md');
    await copyFile(screenshotPath, legacyImagePath);
    await writeFile(
      legacyCardPath,
      `---
created: 2026-01-01T00:00:00.000Z
tags: [capture, inbox]
---

# Capture 2026-01-01

![Screenshot](capture_legacy.png)

## OCR Text
*Not yet implemented*

## AI Summary
*Not yet implemented*
`,
      'utf-8'
    );

    await setCurrentTarget(vaultPath, 'inbox', legacyCardPath, legacyImagePath);

    const appended = await captureScreenshot(screenshotPath, {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'append',
    });

    const after = await readFile(legacyCardPath, 'utf-8');
    assert.ok(after.includes('![Screenshot](capture_legacy.png)'));
    assert.ok(after.includes('![Screenshot](attachments/'));
    assert.strictEqual(after.match(/!\[Screenshot\]/g)?.length, 2);

    const leftover = await readFile(legacyImagePath);
    assert.deepStrictEqual(leftover, await readFile(screenshotPath));
    assert.ok(isUnderAttachmentsDir(appended.imagePath, inboxPath));
    assert.ok(!after.includes('## My Notes'));

    const inboxFiles = await readdir(inboxPath);
    assert.ok(inboxFiles.includes('capture_legacy.png'));

    await rm(testDir, { recursive: true, force: true });
  });

  test('concurrent creates keep unique attachment files', async () => {
    const vaultPath = join(testDir, 'vault-att-conc');
    await mkdir(vaultPath, { recursive: true });
    const screenshotPath = join(fixturesDir, 'test-image.png');
    const config = {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create' as const,
    };

    const results = await Promise.all([
      captureScreenshot(screenshotPath, config),
      captureScreenshot(screenshotPath, config),
      captureScreenshot(screenshotPath, config),
    ]);

    const images = new Set(results.map((r) => r.imagePath));
    assert.strictEqual(images.size, 3);
    const inboxPath = join(vaultPath, 'inbox');
    for (const result of results) {
      assert.ok(isUnderAttachmentsDir(result.imagePath, inboxPath));
    }

    await rm(testDir, { recursive: true, force: true });
  });
});
