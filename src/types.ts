export type CaptureAction = 'create' | 'append';

export type ProvenanceSource = 'cli' | 'env' | 'hook';

export interface CaptureConfig {
  vaultPath: string;
  inboxSubdir: string;
  skipOpen?: boolean;
  action?: CaptureAction;
  /** Resolved Claude Code session ID, or null/omitted for a source-less capture. */
  sessionId?: string | null;
  sessionIdSource?: ProvenanceSource | null;
}

export interface CaptureResult {
  imagePath: string;
  cardPath: string;
  opened: boolean;
  sessionId: string | null;
}

export interface CaptureError extends Error {
  code: string;
}
