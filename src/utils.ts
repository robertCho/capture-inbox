import { access, constants } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, sep, normalize } from 'node:path';

/**
 * Validates that a path is safe and within the vault directory
 */
export function validatePath(targetPath: string, vaultPath: string): void {
  const normalizedTarget = normalize(resolve(targetPath));
  const normalizedVault = normalize(resolve(vaultPath));

  if (!normalizedTarget.startsWith(normalizedVault)) {
    throw createError('Path escapes vault directory', 'PATH_ESCAPE');
  }
}

/**
 * Checks if a file exists and is readable
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates a unique timestamp-based filename
 */
export function generateTimestampFilename(extension: string): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5);
  return `capture_${timestamp}${extension}`;
}

/**
 * Creates a safe filename, handling potential collisions
 */
export async function generateUniqueFilename(
  directory: string,
  baseFilename: string,
  extension: string
): Promise<string> {
  let filename = `${baseFilename}${extension}`;
  let fullPath = join(directory, filename);
  let counter = 1;

  while (await fileExists(fullPath)) {
    filename = `${baseFilename}_${counter}${extension}`;
    fullPath = join(directory, filename);
    counter++;
  }

  return filename;
}

/**
 * Encodes a file path for use in an Obsidian URI
 */
export function encodeObsidianUri(vaultPath: string, filePath: string): string {
  const vaultName = vaultPath.split(sep).pop() || 'vault';
  const relativePath = relative(vaultPath, filePath);
  const normalizedPath = relativePath.split(sep).join('/');
  const encodedPath = encodeURIComponent(normalizedPath);
  const encodedVault = encodeURIComponent(vaultName);
  
  return `obsidian://open?vault=${encodedVault}&file=${encodedPath}`;
}

/**
 * Creates a custom error with a code
 */
export function createError(message: string, code: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

/**
 * Validates that a path is absolute and doesn't contain suspicious patterns
 */
export function validateAbsolutePath(path: string, paramName: string): void {
  if (!path) {
    throw createError(`${paramName} is required`, 'MISSING_PATH');
  }
  
  if (!isAbsolute(path)) {
    throw createError(`${paramName} must be an absolute path`, 'RELATIVE_PATH');
  }
}
