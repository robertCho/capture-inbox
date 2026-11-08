import { createError } from './utils.js';

export type ProvenanceSource = 'cli' | 'env' | 'hook';

export interface SessionProvenance {
  sessionId: string | null;
  source: ProvenanceSource | null;
}

/** Official Claude Code env contract (Bash/PowerShell tools, hooks, stdio MCP). */
export const CLAUDE_CODE_SESSION_ENV = 'CLAUDE_CODE_SESSION_ID';

/**
 * Session IDs from Claude Code are opaque identifiers (typically UUIDs).
 * Reject path-like or whitespace values so provenance cannot become a traversal vector.
 * Do not treat titles, "latest session", or transcript paths as IDs.
 */
const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export function validateSessionId(raw: string, origin: string): string {
  const sessionId = raw.trim();
  if (!sessionId) {
    throw createError(`Empty session ID from ${origin}`, 'INVALID_SESSION_ID');
  }
  if (sessionId.includes('..') || sessionId.includes('/') || sessionId.includes('\\')) {
    throw createError(`Session ID from ${origin} must not contain path characters`, 'INVALID_SESSION_ID');
  }
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw createError(
      `Session ID from ${origin} is not a valid Claude Code session identifier`,
      'INVALID_SESSION_ID'
    );
  }
  return sessionId;
}

export function parseHookSessionId(hookJson: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(hookJson);
  } catch {
    throw createError('Invalid hook JSON on stdin', 'INVALID_HOOK_INPUT');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createError('Hook JSON must be an object with session_id', 'INVALID_HOOK_INPUT');
  }

  const sessionId = (parsed as { session_id?: unknown }).session_id;
  if (typeof sessionId !== 'string') {
    throw createError('Hook JSON missing session_id', 'INVALID_HOOK_INPUT');
  }

  return validateSessionId(sessionId, 'hook stdin session_id');
}

/**
 * Resolve Claude Code session provenance from official public contracts only:
 * - CLI `--session-id` (explicit association)
 * - `CLAUDE_CODE_SESSION_ID` env (set on Claude Code child processes)
 * - Hook stdin JSON `session_id` (when `--from-hook` is used)
 *
 * Never guesses "latest" / active session / window title.
 * Never reads transcripts, databases, or Claude app-internal files.
 * Source-less captures (all sources absent) are valid.
 * Conflicting provided sources are an error, not a silent pick.
 */
export function resolveSessionProvenance(input: {
  explicitSessionId?: string | null;
  hookSessionId?: string | null;
  envSessionId?: string | null;
}): SessionProvenance {
  const provided: Array<{ source: ProvenanceSource; raw: string }> = [];

  if (input.explicitSessionId != null && input.explicitSessionId !== '') {
    provided.push({
      source: 'cli',
      raw: validateSessionId(input.explicitSessionId, '--session-id'),
    });
  }

  if (input.hookSessionId != null && input.hookSessionId !== '') {
    provided.push({
      source: 'hook',
      raw: validateSessionId(input.hookSessionId, 'hook session_id'),
    });
  }

  if (input.envSessionId != null && input.envSessionId !== '') {
    provided.push({
      source: 'env',
      raw: validateSessionId(input.envSessionId, CLAUDE_CODE_SESSION_ENV),
    });
  }

  if (provided.length === 0) {
    return { sessionId: null, source: null };
  }

  const canonical = provided[0].raw;
  for (const item of provided.slice(1)) {
    if (item.raw !== canonical) {
      throw createError(
        `Conflicting Claude Code session IDs from ${provided[0].source} and ${item.source}`,
        'SESSION_ID_CONFLICT'
      );
    }
  }

  return { sessionId: canonical, source: provided[0].source };
}

export function readCardSessionId(cardContent: string): string | null {
  const match = cardContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return null;
  }

  const frontmatter = match[1];
  const line = frontmatter.match(/^claudeCodeSessionId:\s*(.+)$/m);
  if (!line) {
    return null;
  }

  let value = line[1].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  if (!value) {
    return null;
  }

  try {
    return validateSessionId(value, 'card frontmatter');
  } catch {
    return null;
  }
}

/**
 * Append keeps the card's existing provenance.
 * Incoming ID may only confirm the same ID; a different ID is SESSION_MISMATCH.
 * Source-less incoming captures do not clear or invent card provenance.
 * Incoming IDs do not retcon a source-less card.
 */
export function assertAppendProvenance(
  cardSessionId: string | null,
  incomingSessionId: string | null
): string | null {
  if (cardSessionId && incomingSessionId && cardSessionId !== incomingSessionId) {
    throw createError(
      `Append session ID does not match this card's Claude Code session (${cardSessionId})`,
      'SESSION_MISMATCH'
    );
  }
  return cardSessionId;
}
