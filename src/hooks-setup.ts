import { readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileExists, createError } from './utils.js';
import { writeJsonAtomic } from './state.js';

export const HOOK_COMMAND_MARKER = '--hook-event';
export const HOOK_EVENTS = ['SessionStart', 'SessionEnd', 'UserPromptSubmit'] as const;

export function quoteCliArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function buildHookCommand(options: {
  nodePath: string;
  binPath: string;
  vaultPath: string;
  inboxSubdir: string;
}): string {
  return [
    quoteCliArg(options.nodePath),
    quoteCliArg(options.binPath),
    HOOK_COMMAND_MARKER,
    '--vault-path',
    quoteCliArg(options.vaultPath),
    '--inbox-subdir',
    quoteCliArg(options.inboxSubdir),
  ].join(' ');
}

export function buildHookSettingsFragment(command: string): Record<string, unknown> {
  const handler = {
    hooks: [
      {
        type: 'command',
        command,
      },
    ],
  };
  const hooks: Record<string, unknown[]> = {};
  for (const eventName of HOOK_EVENTS) {
    hooks[eventName] = [handler];
  }
  return { hooks };
}

function isOurHookCommand(command: unknown): boolean {
  return typeof command === 'string' && command.includes(HOOK_COMMAND_MARKER) && command.includes('capture-inbox');
}

function matchersHaveOurHook(matchers: unknown): boolean {
  if (!Array.isArray(matchers)) {
    return false;
  }
  for (const matcher of matchers) {
    if (!matcher || typeof matcher !== 'object') continue;
    const hooks = (matcher as { hooks?: unknown }).hooks;
    if (!Array.isArray(hooks)) continue;
    for (const hook of hooks) {
      if (hook && typeof hook === 'object' && isOurHookCommand((hook as { command?: unknown }).command)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Merge capture-inbox hook handlers into an existing Claude Code settings object.
 * Never deletes or replaces user/project hooks. Idempotent if our command is present.
 */
export function mergeHookSettings(
  existing: Record<string, unknown>,
  command: string
): { settings: Record<string, unknown>; added: string[]; skipped: string[] } {
  const settings: Record<string, unknown> = { ...existing };
  const existingHooks =
    existing.hooks && typeof existing.hooks === 'object' && !Array.isArray(existing.hooks)
      ? { ...(existing.hooks as Record<string, unknown>) }
      : {};

  const added: string[] = [];
  const skipped: string[] = [];
  const ourMatcher = {
    hooks: [{ type: 'command', command }],
  };

  for (const eventName of HOOK_EVENTS) {
    const current = existingHooks[eventName];
    if (matchersHaveOurHook(current)) {
      skipped.push(eventName);
      continue;
    }
    const list = Array.isArray(current) ? [...current] : [];
    list.push(ourMatcher);
    existingHooks[eventName] = list;
    added.push(eventName);
  }

  settings.hooks = existingHooks;
  return { settings, added, skipped };
}

export async function mergeHooksIntoSettingsFile(
  settingsPath: string,
  command: string
): Promise<{ added: string[]; skipped: string[]; created: boolean }> {
  if (!settingsPath) {
    throw createError('--settings-file is required for --merge-hooks', 'MISSING_PATH');
  }

  let existing: Record<string, unknown> = {};
  let created = false;
  if (await fileExists(settingsPath)) {
    try {
      const parsed = JSON.parse(await readFile(settingsPath, 'utf-8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw createError('Settings file must contain a JSON object', 'INVALID_HOOK_INPUT');
      }
      existing = parsed as Record<string, unknown>;
    } catch (error: any) {
      if (error?.code === 'INVALID_HOOK_INPUT') throw error;
      throw createError('Settings file is not valid JSON', 'INVALID_HOOK_INPUT');
    }
  } else {
    created = true;
    await mkdir(dirname(settingsPath), { recursive: true });
  }

  const { settings, added, skipped } = mergeHookSettings(existing, command);
  await writeJsonAtomic(settingsPath, settings);
  return { added, skipped, created };
}
