import { test, describe } from 'node:test';
import assert from 'node:assert';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  appendImageToCard,
  extractMyNotesSection,
  generateCardContent,
  MY_NOTES_HEADING,
} from '../card.js';
import { captureScreenshot } from '../capture.js';

describe('My Notes section', () => {
  const testDir = join(process.cwd(), 'test-temp-notes');
  const fixturesDir = join(process.cwd(), 'fixtures');

  test('new cards include an empty My Notes section that is not AI-filled', () => {
    const content = generateCardContent('attachments/capture.png');
    assert.ok(content.includes(`${MY_NOTES_HEADING}\n\n`));
    assert.ok(!content.includes('AI-filled'));
    assert.ok(!content.toLowerCase().includes('todo: summarize'));
    const notes = extractMyNotesSection(content);
    assert.ok(notes);
    assert.strictEqual(notes.trim(), MY_NOTES_HEADING);
  });

  test('append inserts images before My Notes and leaves notes text untouched', () => {
    const original = generateCardContent('attachments/one.png');
    const withNotes = original.replace(
      `${MY_NOTES_HEADING}\n\n`,
      `${MY_NOTES_HEADING}\n\nUser typed: keep this sentence.\n`
    );
    const updated = appendImageToCard(withNotes, 'attachments/two.png');

    assert.ok(updated.includes('User typed: keep this sentence.'));
    assert.strictEqual(extractMyNotesSection(updated), extractMyNotesSection(withNotes));
    const notesIndex = updated.indexOf(MY_NOTES_HEADING);
    const image2Index = updated.indexOf('attachments/two.png');
    assert.ok(image2Index < notesIndex);
  });

  test('append preserves arbitrary user edits outside My Notes', () => {
    const original = `# Custom title\n\nIntro note\n\n![Screenshot](a.png)\n\n${MY_NOTES_HEADING}\n\nMine\n\n## OCR Text\nkept\n`;
    const updated = appendImageToCard(original, 'attachments/b.png');
    assert.ok(updated.includes('# Custom title'));
    assert.ok(updated.includes('Intro note'));
    assert.ok(updated.includes('Mine'));
    assert.ok(updated.includes('## OCR Text\nkept'));
    assert.ok(updated.includes('![Screenshot](attachments/b.png)'));
  });

  test('create then typed notes then append preserves notes exactly', async () => {
    const vaultPath = join(testDir, 'vault-notes-1');
    await mkdir(vaultPath, { recursive: true });
    const screenshotPath = join(fixturesDir, 'test-image.png');

    const created = await captureScreenshot(screenshotPath, {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'create',
    });

    let card = await readFile(created.cardPath, 'utf-8');
    const typed = 'Do not overwrite: 中文 notes and spaces.';
    card = card.replace(`${MY_NOTES_HEADING}\n\n`, `${MY_NOTES_HEADING}\n\n${typed}\n`);
    await writeFile(created.cardPath, card, 'utf-8');
    const notesBefore = extractMyNotesSection(card);

    await captureScreenshot(screenshotPath, {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'append',
    });

    const after = await readFile(created.cardPath, 'utf-8');
    assert.strictEqual(extractMyNotesSection(after), notesBefore);
    assert.ok(after.includes(typed));
    assert.strictEqual(after.match(/!\[Screenshot\]/g)?.length, 2);

    await rm(testDir, { recursive: true, force: true });
  });

  test('append at end when no My Notes or OCR headings', () => {
    const updated = appendImageToCard('# Title\n\n![Screenshot](a.png)\n', 'attachments/b.png');
    assert.ok(updated.includes('![Screenshot](a.png)'));
    assert.ok(updated.includes('![Screenshot](attachments/b.png)'));
  });

  test('extractMyNotesSection when notes is the last heading', () => {
    const notes = extractMyNotesSection(`${MY_NOTES_HEADING}\n\nonly notes`);
    assert.ok(notes?.includes('only notes'));
  });

  test('append does not invent My Notes on a legacy card that lacks the section', async () => {
    const vaultPath = join(testDir, 'vault-notes-2');
    const inboxPath = join(vaultPath, 'inbox');
    await mkdir(inboxPath, { recursive: true });
    const screenshotPath = join(fixturesDir, 'test-image.png');

    const created = await captureScreenshot(screenshotPath, {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
    });

    const stripped = (await readFile(created.cardPath, 'utf-8')).replace(
      `${MY_NOTES_HEADING}\n\n`,
      ''
    );
    await writeFile(created.cardPath, stripped, 'utf-8');

    await captureScreenshot(screenshotPath, {
      vaultPath,
      inboxSubdir: 'inbox',
      skipOpen: true,
      action: 'append',
    });

    const after = await readFile(created.cardPath, 'utf-8');
    assert.ok(!after.includes(MY_NOTES_HEADING));
    assert.strictEqual(after.match(/!\[Screenshot\]/g)?.length, 2);

    await rm(testDir, { recursive: true, force: true });
  });
});
