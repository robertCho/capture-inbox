import { copyFile, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
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
import { withLock } from './lock.js';
import { prepareAttachmentPath } from './attachments.js';
import { appendImageToCard, generateCardContent, readCardSessionId } from './card.js';
import { assertAppendProvenance } from './provenance.js';

const execAsync = promisify(exec);

/**
 * Main capture function: copies screenshot and creates Obsidian card
 * All operations are serialized per inbox using file-based locking
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
  const incomingSessionId = config.sessionId ?? null;

  // Serialize all operations per inbox to prevent lost updates
  return await withLock(config.vaultPath, config.inboxSubdir, action, async () => {
    if (action === 'append') {
      return await appendToCard(screenshotPath, config, inboxPath, incomingSessionId);
    } else {
      return await createNewCard(screenshotPath, config, inboxPath, incomingSessionId);
    }
  });
}

/**
 * Create a new card. Images go in inbox/attachments/; the card stays in inbox/.
 */
async function createNewCard(
  screenshotPath: string,
  config: CaptureConfig,
  inboxPath: string,
  sessionId: string | null
): Promise<CaptureResult> {
  const imageExtension = extname(screenshotPath);
  const baseTimestamp = generateTimestampFilename('').slice(0, -1);

  const attachment = await prepareAttachmentPath(
    inboxPath,
    config.vaultPath,
    baseTimestamp,
    imageExtension
  );
  const cardFilename = await generateUniqueFilename(inboxPath, baseTimestamp, '.md');
  const cardPath = join(inboxPath, cardFilename);
  validatePath(cardPath, config.vaultPath);

  await copyFile(screenshotPath, attachment.absolutePath);

  const cardContent = generateCardContent(attachment.markdownRef, sessionId);
  await writeFile(cardPath, cardContent, 'utf-8');

  await setCurrentTarget(config.vaultPath, config.inboxSubdir, cardPath, attachment.absolutePath);

  let opened = false;
  if (!config.skipOpen) {
    opened = await openInObsidian(config.vaultPath, cardPath);
  }

  return {
    imagePath: attachment.absolutePath,
    cardPath,
    opened,
    sessionId,
  };
}

/**
 * Append a screenshot to the current target card.
 * New images always go to attachments/; legacy same-folder image refs are left untouched.
 */
async function appendToCard(
  screenshotPath: string,
  config: CaptureConfig,
  inboxPath: string,
  incomingSessionId: string | null
): Promise<CaptureResult> {
  const target = await validateTargetForAppend(config.vaultPath, config.inboxSubdir);
  const currentContent = await readFile(target.cardPath, 'utf-8');
  const cardSessionId = readCardSessionId(currentContent);
  const sessionId = assertAppendProvenance(cardSessionId, incomingSessionId);

  const imageExtension = extname(screenshotPath);
  const baseTimestamp = generateTimestampFilename('').slice(0, -1);
  const attachment = await prepareAttachmentPath(
    inboxPath,
    config.vaultPath,
    baseTimestamp,
    imageExtension
  );

  await copyFile(screenshotPath, attachment.absolutePath);

  const updatedContent = appendImageToCard(currentContent, attachment.markdownRef);
  await writeFile(target.cardPath, updatedContent, 'utf-8');

  let opened = false;
  if (!config.skipOpen) {
    opened = await openInObsidian(config.vaultPath, target.cardPath);
  }

  return {
    imagePath: attachment.absolutePath,
    cardPath: target.cardPath,
    opened,
    sessionId,
  };
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
  } catch {
    return false;
  }
}
