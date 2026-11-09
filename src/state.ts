import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileExists, validatePath, createError } from './utils.js';

/**
 * State file structure for tracking current target card per vault/inbox
 */
export interface CaptureState {
  version: string;
  currentTarget: {
    cardPath: string;
    imagePath: string;
    timestamp: string;
    vault: string;
    inbox: string;
  } | null;
}

const STATE_VERSION = '1.0.0';
export const STATE_DIR = '.capture-inbox-state';
const STATE_FILE = 'current-target.json';

/**
 * Get the state file path for a specific vault/inbox combination
 */
function getStateFilePath(vaultPath: string, inboxSubdir: string): string {
  const stateDir = join(vaultPath, inboxSubdir, STATE_DIR);
  return join(stateDir, STATE_FILE);
}

/**
 * Get the state directory path
 */
export function getStateDirPath(vaultPath: string, inboxSubdir: string): string {
  return join(vaultPath, inboxSubdir, STATE_DIR);
}

/**
 * Atomic JSON write used by target state and the session registry.
 */
export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const uniqueSuffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const tempFilePath = `${filePath}.tmp.${uniqueSuffix}`;

  try {
    await writeFile(tempFilePath, JSON.stringify(value, null, 2), 'utf-8');
    await renameWithRetry(tempFilePath, filePath, 5, 100);
  } catch (error) {
    try {
      const { unlink } = await import('node:fs/promises');
      await unlink(tempFilePath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Read the current target state from the state file
 */
export async function readState(vaultPath: string, inboxSubdir: string): Promise<CaptureState> {
  const stateFilePath = getStateFilePath(vaultPath, inboxSubdir);
  
  if (!(await fileExists(stateFilePath))) {
    return {
      version: STATE_VERSION,
      currentTarget: null,
    };
  }

  try {
    const content = await readFile(stateFilePath, 'utf-8');
    const state = JSON.parse(content) as CaptureState;
    
    // Validate state version
    if (!state.version || state.version !== STATE_VERSION) {
      return {
        version: STATE_VERSION,
        currentTarget: null,
      };
    }
    
    return state;
  } catch (error) {
    // If state file is corrupted, return empty state
    return {
      version: STATE_VERSION,
      currentTarget: null,
    };
  }
}

/**
 * Write the current target state to the state file
 * 
 * CONCURRENCY CONTRACT:
 * - Production usage: Always called within withLock() - fully serialized, safe
 * - Direct calls: Uses unique temp files + retry logic for robustness
 * - Windows: Rename contention handled via exponential backoff with jitter
 * 
 * Implementation:
 * - Unique temp filename prevents temp file collisions
 * - Retry with jitter reduces thundering herd when multiple writers race
 * - Atomic rename ensures consistent state (last writer wins)
 */
export async function writeState(
  vaultPath: string,
  inboxSubdir: string,
  state: CaptureState
): Promise<void> {
  const stateDir = getStateDirPath(vaultPath, inboxSubdir);
  const stateFilePath = getStateFilePath(vaultPath, inboxSubdir);
  
  await mkdir(stateDir, { recursive: true });
  await writeJsonAtomic(stateFilePath, state);
}

/**
 * Rename with retry logic for Windows compatibility
 * Windows can return EPERM on rename if target file is temporarily locked
 * Uses exponential backoff with jitter to avoid thundering herd
 */
async function renameWithRetry(
  source: string,
  target: string,
  maxRetries: number,
  delayMs: number
): Promise<void> {
  const { rename } = await import('node:fs/promises');
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await rename(source, target);
      return; // Success
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries;
      const isWindowsLockError = error.code === 'EPERM' || error.code === 'EBUSY' || error.code === 'EACCES';
      
      // Retry only on Windows file locking errors, and only if we have retries left
      if (isWindowsLockError && !isLastAttempt) {
        // Exponential backoff with randomized jitter to avoid thundering herd
        // Base delays: 100ms, 200ms, 400ms
        // Jitter adds 0-50% random variation
        const baseDelay = delayMs * Math.pow(2, attempt);
        const jitter = Math.random() * baseDelay * 0.5;
        const totalDelay = baseDelay + jitter;
        
        await new Promise(resolve => setTimeout(resolve, totalDelay));
        continue;
      }
      
      // Not a retryable error, or out of retries
      throw error;
    }
  }
}

/**
 * Set the current target card after a successful create operation
 */
export async function setCurrentTarget(
  vaultPath: string,
  inboxSubdir: string,
  cardPath: string,
  imagePath: string
): Promise<void> {
  const state: CaptureState = {
    version: STATE_VERSION,
    currentTarget: {
      cardPath,
      imagePath,
      timestamp: new Date().toISOString(),
      vault: vaultPath,
      inbox: inboxSubdir,
    },
  };
  
  await writeState(vaultPath, inboxSubdir, state);
}

/**
 * Get the current target card and validate it still exists
 * Returns null if no target is set or if the target is invalid
 */
export async function getCurrentTarget(
  vaultPath: string,
  inboxSubdir: string
): Promise<{ cardPath: string; imagePath: string } | null> {
  const state = await readState(vaultPath, inboxSubdir);
  
  if (!state.currentTarget) {
    return null;
  }
  
  const { cardPath, imagePath, vault, inbox } = state.currentTarget;
  
  // Validate that the target is for the same vault/inbox
  if (vault !== vaultPath || inbox !== inboxSubdir) {
    return null;
  }
  
  // Validate paths are still within vault
  try {
    validatePath(cardPath, vaultPath);
    validatePath(imagePath, vaultPath);
  } catch {
    return null;
  }
  
  // Validate that the card file still exists
  if (!(await fileExists(cardPath))) {
    return null;
  }
  
  return { cardPath, imagePath };
}

/**
 * Validate that a target card is suitable for appending
 */
export async function validateTargetForAppend(
  vaultPath: string,
  inboxSubdir: string
): Promise<{ cardPath: string; imagePath: string }> {
  const state = await readState(vaultPath, inboxSubdir);
  
  // Check if a target was ever set
  if (!state.currentTarget) {
    throw createError(
      'No current target card found. Create a new card first with --action create',
      'NO_TARGET'
    );
  }
  
  // Check if the target card still exists
  if (!(await fileExists(state.currentTarget.cardPath))) {
    throw createError(
      `Current target card no longer exists: ${state.currentTarget.cardPath}`,
      'TARGET_MISSING'
    );
  }
  
  // Use getCurrentTarget for full validation
  const target = await getCurrentTarget(vaultPath, inboxSubdir);
  
  if (!target) {
    // This shouldn't happen given the checks above, but handle it
    throw createError(
      'Current target card is invalid',
      'TARGET_MISSING'
    );
  }
  
  return target;
}
