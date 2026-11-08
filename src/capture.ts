import { copyFile, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, extname, resolve, dirname, basename } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { CaptureConfig, CaptureResult } from './types.js';
import {
  validatePath,
  validateAbsolutePath,
  fileExists,
  generateTimestampFilename,
  generateUniqueFilename,
  encodeObsidianUri,
  createError,
} from './utils.js';
import {
  setCurrentTarget,
  validateTargetForAppend,
} from './state.js';

const execAsync = promisify(exec);

/**
 * Main capture function: copies screenshot and creates Obsidian card
 */
export async function captureScreenshot(
  screenshotPath: string,
  config: CaptureConfig
): Promise<CaptureResult> {
  validateAbsolutePath(screenshotPath, 'Screenshot path');
  validateAbsolutePath(config.vaultPath, 'Vault path');

  if (!(await fileExists(screenshotPath))) {
    throw createError('Screenshot file not found', 'FILE_NOT_FOUND');
  }

  if (!(await fileExists(config.vaultPath))) {
    throw createError('Vault directory not found', 'VAULT_NOT_FOUND');
  }

  const inboxPath = resolve(config.vaultPath, config.inboxSubdir);
  validatePath(inboxPath, config.vaultPath);

  await mkdir(inboxPath, { recursive: true });

  const action = config.action || 'create';

  if (action === 'append') {
    return await appendToCard(screenshotPath, config, inboxPath);
  } else {
    return await createNewCard(screenshotPath, config, inboxPath);
  }
}

/**
 * Create a new card (existing behavior)
 */
async function createNewCard(
  screenshotPath: string,
  config: CaptureConfig,
  inboxPath: string
): Promise<CaptureResult> {
  const imageExtension = extname(screenshotPath);
  const baseTimestamp = generateTimestampFilename('').slice(0, -1);
  
  const imageFilename = await generateUniqueFilename(inboxPath, baseTimestamp, imageExtension);
  const cardFilename = await generateUniqueFilename(inboxPath, baseTimestamp, '.md');

  const imagePath = join(inboxPath, imageFilename);
  const cardPath = join(inboxPath, cardFilename);

  await copyFile(screenshotPath, imagePath);

  const cardContent = generateCardContent(imageFilename);
  await writeFile(cardPath, cardContent, 'utf-8');

  // Store this as the current target
  await setCurrentTarget(config.vaultPath, config.inboxSubdir, cardPath, imagePath);

  let opened = false;
  if (!config.skipOpen) {
    opened = await openInObsidian(config.vaultPath, cardPath);
  }

  return {
    imagePath,
    cardPath,
    opened,
  };
}

/**
 * Append a screenshot to the current target card
 */
async function appendToCard(
  screenshotPath: string,
  config: CaptureConfig,
  inboxPath: string
): Promise<CaptureResult> {
  // Validate that we have a current target
  const target = await validateTargetForAppend(config.vaultPath, config.inboxSubdir);

  // Copy the new screenshot with unique filename
  const imageExtension = extname(screenshotPath);
  const baseTimestamp = generateTimestampFilename('').slice(0, -1);
  const imageFilename = await generateUniqueFilename(inboxPath, baseTimestamp, imageExtension);
  const imagePath = join(inboxPath, imageFilename);

  await copyFile(screenshotPath, imagePath);

  // Read the current card content
  const currentContent = await readFile(target.cardPath, 'utf-8');

  // Append the new image to the card, preserving user edits
  const updatedContent = appendImageToCard(currentContent, imageFilename);
  await writeFile(target.cardPath, updatedContent, 'utf-8');

  let opened = false;
  if (!config.skipOpen) {
    opened = await openInObsidian(config.vaultPath, target.cardPath);
  }

  return {
    imagePath,
    cardPath: target.cardPath,
    opened,
  };
}

/**
 * Generates the Markdown content for the capture card
 */
function generateCardContent(imageFilename: string): string {
  const timestamp = new Date().toISOString();
  
  return `---
created: ${timestamp}
tags: [capture, inbox]
---

# Capture ${timestamp.split('T')[0]}

![Screenshot](${imageFilename})

## OCR Text
*Not yet implemented*

## AI Summary
*Not yet implemented*
`;
}

/**
 * Appends a new image to an existing card, preserving user edits
 * Inserts the new image before the "## OCR Text" section if found,
 * otherwise appends at the end
 */
function appendImageToCard(currentContent: string, imageFilename: string): string {
  const newImageLine = `\n![Screenshot](${imageFilename})\n`;
  
  // Try to insert before the OCR Text section to preserve structure
  const ocrSectionIndex = currentContent.indexOf('## OCR Text');
  
  if (ocrSectionIndex !== -1) {
    // Insert before OCR section
    return currentContent.slice(0, ocrSectionIndex) + newImageLine + '\n' + currentContent.slice(ocrSectionIndex);
  } else {
    // OCR section not found (user might have deleted it), append at end
    return currentContent.trimEnd() + '\n' + newImageLine;
  }
}

/**
 * Opens the card in Obsidian using the URI protocol
 */
async function openInObsidian(vaultPath: string, cardPath: string): Promise<boolean> {
  const uri = encodeObsidianUri(vaultPath, cardPath);

  try {
    if (process.platform === 'win32') {
      await execAsync(`start "" "${uri}"`);
    } else if (process.platform === 'darwin') {
      await execAsync(`open "${uri}"`);
    } else {
      await execAsync(`xdg-open "${uri}"`);
    }
    return true;
  } catch (error) {
    return false;
  }
}
