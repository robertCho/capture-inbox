import { mkdir } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { createError, generateUniqueFilename, validatePath } from './utils.js';

/** Image files for new captures live here, under the inbox. Cards stay in the inbox root. */
export const ATTACHMENTS_SUBDIR = 'attachments';

export function getAttachmentsDir(inboxPath: string): string {
  return join(inboxPath, ATTACHMENTS_SUBDIR);
}

export function assertSafeAttachmentFilename(filename: string): void {
  if (!filename || filename !== filename.replace(/[/\\]/g, '')) {
    throw createError('Attachment filename must not contain path separators', 'PATH_ESCAPE');
  }
  if (filename === '.' || filename === '..' || filename.includes('..')) {
    throw createError('Attachment filename must not contain path traversal', 'PATH_ESCAPE');
  }
}

/**
 * Portable Obsidian markdown image target: POSIX separators, percent-encode
 * characters that break `![alt](path)` syntax. Unicode is kept as UTF-8.
 */
export function toMarkdownRelativeRef(relativePosixPath: string): string {
  const normalized = relativePosixPath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.startsWith('../') || normalized.split('/').includes('..')) {
    throw createError('Markdown image ref must be a relative path without traversal', 'PATH_ESCAPE');
  }

  return normalized
    .split('/')
    .filter(Boolean)
    .map((segment) =>
      segment
        .replace(/%/g, '%25')
        .replace(/ /g, '%20')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/\[/g, '%5B')
        .replace(/\]/g, '%5D')
        .replace(/#/g, '%23')
    )
    .join('/');
}

export function attachmentMarkdownRef(filename: string): string {
  assertSafeAttachmentFilename(filename);
  return toMarkdownRelativeRef(`${ATTACHMENTS_SUBDIR}/${filename}`);
}

export async function prepareAttachmentPath(
  inboxPath: string,
  vaultPath: string,
  baseTimestamp: string,
  extension: string
): Promise<{ filename: string; absolutePath: string; markdownRef: string }> {
  const attachmentsDir = getAttachmentsDir(inboxPath);
  validatePath(attachmentsDir, vaultPath);
  await mkdir(attachmentsDir, { recursive: true });

  const filename = await generateUniqueFilename(attachmentsDir, baseTimestamp, extension);
  assertSafeAttachmentFilename(filename);

  const absolutePath = join(attachmentsDir, filename);
  validatePath(absolutePath, vaultPath);

  return {
    filename,
    absolutePath,
    markdownRef: attachmentMarkdownRef(filename),
  };
}

export function isUnderAttachmentsDir(imagePath: string, inboxPath: string): boolean {
  const attachmentsDir = getAttachmentsDir(inboxPath);
  const prefix = attachmentsDir.endsWith(sep) ? attachmentsDir : attachmentsDir + sep;
  return imagePath.startsWith(prefix) || imagePath === attachmentsDir;
}
