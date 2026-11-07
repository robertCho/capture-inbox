import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join, extname, resolve, dirname } from 'node:path';
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

  const imageExtension = extname(screenshotPath);
  const baseTimestamp = generateTimestampFilename('').slice(0, -1);
  
  const imageFilename = await generateUniqueFilename(inboxPath, baseTimestamp, imageExtension);
  const cardFilename = await generateUniqueFilename(inboxPath, baseTimestamp, '.md');

  const imagePath = join(inboxPath, imageFilename);
  const cardPath = join(inboxPath, cardFilename);

  await copyFile(screenshotPath, imagePath);

  const cardContent = generateCardContent(imageFilename);
  await writeFile(cardPath, cardContent, 'utf-8');

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
