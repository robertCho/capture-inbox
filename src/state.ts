import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
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
const STATE_DIR = '.capture-inbox-state';
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
function getStateDirPath(vaultPath: string, inboxSubdir: string): string {
  return join(vaultPath, inboxSubdir, STATE_DIR);
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
 */
export async function writeState(
  vaultPath: string,
  inboxSubdir: string,
  state: CaptureState
): Promise<void> {
  const stateDir = getStateDirPath(vaultPath, inboxSubdir);
  const stateFilePath = getStateFilePath(vaultPath, inboxSubdir);
  
  // Ensure state directory exists
  await mkdir(stateDir, { recursive: true });
  
  // Write state file atomically by writing to temp file first
  const tempFilePath = `${stateFilePath}.tmp`;
  await writeFile(tempFilePath, JSON.stringify(state, null, 2), 'utf-8');
  
  // Rename is atomic on most systems
  const { rename } = await import('node:fs/promises');
  await rename(tempFilePath, stateFilePath);
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
