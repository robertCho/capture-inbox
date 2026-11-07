export interface CaptureConfig {
  vaultPath: string;
  inboxSubdir: string;
  skipOpen?: boolean;
}

export interface CaptureResult {
  imagePath: string;
  cardPath: string;
  opened: boolean;
}

export interface CaptureError extends Error {
  code: string;
}
