import { open, mkdir, rm, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createError } from './utils.js';

/**
 * Simple file-based lock implementation for per-inbox operation serialization
 * Uses lockfile approach with timeout and stale lock detection
 */

const LOCK_TIMEOUT_MS = 30000; // 30 seconds max lock hold time
const LOCK_ACQUIRE_TIMEOUT_MS = 60000; // 60 seconds max wait to acquire
const LOCK_POLL_INTERVAL_MS = 100; // Check every 100ms

interface LockInfo {
  pid: number;
  timestamp: number;
  operation: string;
}

/**
 * Get the lock directory path for a vault/inbox combination
 */
function getLockDirPath(vaultPath: string, inboxSubdir: string): string {
  return join(vaultPath, inboxSubdir, '.capture-inbox-state');
}

/**
 * Get the lock file path
 */
function getLockFilePath(vaultPath: string, inboxSubdir: string): string {
  return join(getLockDirPath(vaultPath, inboxSubdir), 'operation.lock');
}

/**
 * Check if a process is still running
 */
function isProcessAlive(pid: number): boolean {
  try {
    // Sending signal 0 doesn't kill the process, just checks if it exists
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    // ESRCH means process doesn't exist
    // EPERM means process exists but we don't have permission (still alive)
    return error.code === 'EPERM';
  }
}

async function lockMtimeAgeMs(lockPath: string): Promise<number | null> {
  try {
    const info = await stat(lockPath);
    return Date.now() - info.mtimeMs;
  } catch {
    return null;
  }
}

/**
 * A lock is stale only when the holder is gone or the file is abandoned.
 * Do not treat EPERM/EBUSY/empty as stale: on Windows those happen while a
 * live process still owns the lock (wx created the file, write/close in
 * progress, or mandatory locking). Stealing then lets two creates share a
 * timestamp name and overwrite one card.
 */
async function isLockStale(lockPath: string): Promise<boolean> {
  let content: string;
  try {
    content = await readFile(lockPath, 'utf-8');
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    const age = await lockMtimeAgeMs(lockPath);
    return age !== null && age > LOCK_TIMEOUT_MS;
  }

  if (!content.trim()) {
    const age = await lockMtimeAgeMs(lockPath);
    return age !== null && age > LOCK_TIMEOUT_MS;
  }

  let lockInfo: LockInfo;
  try {
    lockInfo = JSON.parse(content) as LockInfo;
  } catch {
    return true;
  }

  if (typeof lockInfo.pid !== 'number' || typeof lockInfo.timestamp !== 'number') {
    return true;
  }

  if (!isProcessAlive(lockInfo.pid)) {
    return true;
  }

  return false;
}

/**
 * Acquire a lock for the inbox operations
 * Returns a release function
 */
export async function acquireLock(
  vaultPath: string,
  inboxSubdir: string,
  operation: string
): Promise<() => Promise<void>> {
  const lockDir = getLockDirPath(vaultPath, inboxSubdir);
  const lockPath = getLockFilePath(vaultPath, inboxSubdir);

  // Ensure lock directory exists
  await mkdir(lockDir, { recursive: true });

  const lockInfo: LockInfo = {
    pid: process.pid,
    timestamp: Date.now(),
    operation,
  };

  const startTime = Date.now();

  while (true) {
    try {
      // Try to create lock file exclusively (O_EXCL flag)
      const fd = await open(lockPath, 'wx');
      
      try {
        await fd.writeFile(JSON.stringify(lockInfo), 'utf-8');
      } finally {
        // Always close file descriptor, even on write error
        await fd.close();
        // Small delay to ensure Windows releases file handle
        // Windows file handle release is not immediate after close()
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      // Successfully acquired lock
      return async () => {
        try {
          await rm(lockPath, { force: true });
        } catch {
          // Ignore errors on release
        }
      };
    } catch (error: any) {
      // Lock file exists
      if (error.code !== 'EEXIST') {
        throw error;
      }

      // Check if lock is stale
      const stale = await isLockStale(lockPath);
      if (stale) {
        // Remove stale lock with retry for Windows
        // Windows may return EPERM if file is being released
        try {
          await rmWithRetry(lockPath, 3, 10);
        } catch {
          // If we can't remove it, wait and let next iteration try
        }
        // Small delay to let Windows release file handle
        await new Promise(resolve => setTimeout(resolve, 10));
        continue;
      }

      // Check if we've exceeded acquire timeout
      if (Date.now() - startTime > LOCK_ACQUIRE_TIMEOUT_MS) {
        throw createError(
          'Failed to acquire lock: timeout waiting for concurrent operation to complete',
          'LOCK_TIMEOUT'
        );
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, LOCK_POLL_INTERVAL_MS));
    }
  }
}

/**
 * Remove file with retry for Windows EPERM
 */
async function rmWithRetry(path: string, maxRetries: number, delayMs: number): Promise<void> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await rm(path, { force: true });
      return;
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries;
      const isWindowsLockError = error.code === 'EPERM' || error.code === 'EBUSY';
      
      if (isWindowsLockError && !isLastAttempt) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      
      throw error;
    }
  }
}

/**
 * Execute an operation with a lock
 */
export async function withLock<T>(
  vaultPath: string,
  inboxSubdir: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const release = await acquireLock(vaultPath, inboxSubdir, operation);
  try {
    return await fn();
  } finally {
    await release();
  }
}
