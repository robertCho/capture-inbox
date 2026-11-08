import { open, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileExists, createError } from './utils.js';

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

/**
 * Check if a lock is stale (older than LOCK_TIMEOUT_MS AND process not alive)
 */
async function isLockStale(lockPath: string): Promise<boolean> {
  try {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(lockPath, 'utf-8');
    const lockInfo: LockInfo = JSON.parse(content);
    const age = Date.now() - lockInfo.timestamp;
    
    // Lock is only stale if:
    // 1. It's older than timeout AND
    // 2. The owning process is no longer alive
    if (age > LOCK_TIMEOUT_MS) {
      return !isProcessAlive(lockInfo.pid);
    }
    
    return false;
  } catch {
    // If we can't read or parse, consider it stale
    return true;
  }
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
      await fd.writeFile(JSON.stringify(lockInfo), 'utf-8');
      await fd.close();

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
        // Remove stale lock and retry
        try {
          await rm(lockPath, { force: true });
        } catch {
          // Ignore errors, will retry
        }
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
