import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileExists, createError } from './utils.js';
import { getStateDirPath, writeJsonAtomic } from './state.js';
import { parseHookEvent, validateSessionId } from './provenance.js';

export const SESSION_REGISTRY_FILE = 'session-registry.json';
export const SESSION_REGISTRY_VERSION = '1.0.0';
/** Armed associations older than this without a hook heartbeat are stale. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface SessionRecord {
  sessionId: string;
  status: 'live' | 'ended';
  lastSeen: string;
  armed: boolean;
}

export interface SessionRegistry {
  version: string;
  sessions: Record<string, SessionRecord>;
  armedSessionId: string | null;
}

export interface ArmedAssociation {
  sessionId: string | null;
  reason: 'armed' | 'missing' | 'stale' | 'ended' | 'ambiguous';
  warning: string | null;
}

function emptyRegistry(): SessionRegistry {
  return {
    version: SESSION_REGISTRY_VERSION,
    sessions: {},
    armedSessionId: null,
  };
}

export function getRegistryPath(vaultPath: string, inboxSubdir: string): string {
  return join(getStateDirPath(vaultPath, inboxSubdir), SESSION_REGISTRY_FILE);
}

export async function readSessionRegistry(
  vaultPath: string,
  inboxSubdir: string
): Promise<SessionRegistry> {
  const registryPath = getRegistryPath(vaultPath, inboxSubdir);
  if (!(await fileExists(registryPath))) {
    return emptyRegistry();
  }

  try {
    const parsed = JSON.parse(await readFile(registryPath, 'utf-8')) as SessionRegistry;
    if (!parsed || parsed.version !== SESSION_REGISTRY_VERSION || typeof parsed.sessions !== 'object') {
      return emptyRegistry();
    }
    return {
      version: SESSION_REGISTRY_VERSION,
      sessions: parsed.sessions ?? {},
      armedSessionId: parsed.armedSessionId ?? null,
    };
  } catch {
    return emptyRegistry();
  }
}

export async function writeSessionRegistry(
  vaultPath: string,
  inboxSubdir: string,
  registry: SessionRegistry
): Promise<void> {
  const stateDir = getStateDirPath(vaultPath, inboxSubdir);
  await mkdir(stateDir, { recursive: true });
  await writeJsonAtomic(getRegistryPath(vaultPath, inboxSubdir), registry);
}

function touchLive(registry: SessionRegistry, sessionId: string, at: string): SessionRecord {
  const existing = registry.sessions[sessionId];
  const record: SessionRecord = {
    sessionId,
    status: 'live',
    lastSeen: at,
    armed: existing?.armed === true,
  };
  registry.sessions[sessionId] = record;
  return record;
}

/**
 * Official hook events update liveness only. They never arm a session and
 * never pick a "latest" session for ShareX.
 */
export async function applyHookEventToRegistry(
  vaultPath: string,
  inboxSubdir: string,
  hookJson: string,
  now: Date = new Date()
): Promise<SessionRegistry> {
  const event = parseHookEvent(hookJson);
  const registry = await readSessionRegistry(vaultPath, inboxSubdir);
  const at = now.toISOString();

  if (event.hookEventName === 'SessionEnd') {
    registry.sessions[event.sessionId] = {
      sessionId: event.sessionId,
      status: 'ended',
      lastSeen: at,
      armed: false,
    };
    if (registry.armedSessionId === event.sessionId) {
      registry.armedSessionId = null;
    }
  } else {
    // SessionStart, UserPromptSubmit, Stop, and unknown events: live heartbeat, no arm.
    touchLive(registry, event.sessionId, at);
  }

  await writeSessionRegistry(vaultPath, inboxSubdir, registry);
  return registry;
}

/**
 * Explicit arm: the Claude Code session the user chose for upcoming ShareX captures.
 * Disarms every other session in this vault/inbox. Does not read a session list
 * to guess which ID to use — the ID must be supplied (env or --session-id).
 */
export async function armSession(
  vaultPath: string,
  inboxSubdir: string,
  sessionIdRaw: string,
  now: Date = new Date()
): Promise<SessionRegistry> {
  const sessionId = validateSessionId(sessionIdRaw, '--arm');
  const registry = await readSessionRegistry(vaultPath, inboxSubdir);
  const at = now.toISOString();

  for (const record of Object.values(registry.sessions)) {
    record.armed = false;
  }

  registry.sessions[sessionId] = {
    sessionId,
    status: 'live',
    lastSeen: at,
    armed: true,
  };
  registry.armedSessionId = sessionId;
  await writeSessionRegistry(vaultPath, inboxSubdir, registry);
  return registry;
}

export async function disarmSession(
  vaultPath: string,
  inboxSubdir: string
): Promise<SessionRegistry> {
  const registry = await readSessionRegistry(vaultPath, inboxSubdir);
  for (const record of Object.values(registry.sessions)) {
    record.armed = false;
  }
  registry.armedSessionId = null;
  await writeSessionRegistry(vaultPath, inboxSubdir, registry);
  return registry;
}

/**
 * Resolve the ShareX association. Never returns an ID unless it is the unique
 * explicitly armed, live, unexpired session. Does not fall back to "the only
 * live session" or the most recently seen session.
 */
export async function resolveArmedAssociation(
  vaultPath: string,
  inboxSubdir: string,
  options: { now?: Date; ttlMs?: number } = {}
): Promise<ArmedAssociation> {
  const now = options.now ?? new Date();
  const ttlMs = options.ttlMs ?? SESSION_TTL_MS;
  const registry = await readSessionRegistry(vaultPath, inboxSubdir);

  const armedFlags = Object.values(registry.sessions).filter((record) => record.armed);
  if (armedFlags.length > 1) {
    return {
      sessionId: null,
      reason: 'ambiguous',
      warning: 'Ambiguous armed Claude Code sessions; not stamping an ID. Run --disarm then --arm in one session.',
    };
  }

  const armedId = registry.armedSessionId;
  if (!armedId) {
    return { sessionId: null, reason: 'missing', warning: null };
  }

  const record = registry.sessions[armedId];
  if (!record || !record.armed) {
    return { sessionId: null, reason: 'missing', warning: null };
  }

  if (record.status === 'ended') {
    return {
      sessionId: null,
      reason: 'ended',
      warning: 'Armed Claude Code session has ended; capture is source-less. Re-run --arm in a live session.',
    };
  }

  const lastSeen = Date.parse(record.lastSeen);
  if (!Number.isFinite(lastSeen) || now.getTime() - lastSeen > ttlMs) {
    return {
      sessionId: null,
      reason: 'stale',
      warning: 'Armed Claude Code session is stale; capture is source-less. Re-run --arm in the live session.',
    };
  }

  return { sessionId: record.sessionId, reason: 'armed', warning: null };
}
