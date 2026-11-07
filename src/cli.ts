import { parseArgs } from 'node:util';
import { captureScreenshot } from './capture.js';
import type { CaptureConfig } from './types.js';

interface CliArgs {
  values: {
    'vault-path'?: string;
    'inbox-subdir'?: string;
    'skip-open'?: boolean;
    help?: boolean;
  };
  positionals: string[];
}

const USAGE = `
capture-inbox - Capture screenshots from ShareX to Obsidian

USAGE:
  capture-inbox <screenshot-path> --vault-path <path> [options]

ARGUMENTS:
  <screenshot-path>    Path to the screenshot file to capture

OPTIONS:
  --vault-path <path>       Path to the Obsidian vault (required)
  --inbox-subdir <path>     Subdirectory within vault for captures (default: "inbox")
  --skip-open               Don't open the card in Obsidian after creation
  --help                    Show this help message

EXAMPLES:
  # Basic usage (for ShareX after-capture action)
  capture-inbox "C:\\Users\\user\\Screenshots\\capture.png" --vault-path "C:\\Users\\user\\ObsidianVault"

  # Custom inbox subdirectory
  capture-inbox capture.png --vault-path "/path/to/vault" --inbox-subdir "daily/captures"

  # Testing without opening Obsidian
  capture-inbox test.png --vault-path "./test-vault" --skip-open

SHAREX INTEGRATION:
  Configure ShareX to run this command after capture:
  1. Open ShareX → Task settings → Actions
  2. Add action: capture-inbox "$input" --vault-path "YOUR_VAULT_PATH"
  3. Replace YOUR_VAULT_PATH with your actual Obsidian vault location
  Note: Use $input (ShareX Actions placeholder for captured file)
`;

export async function main(argv: string[]): Promise<void> {
  let args: CliArgs;
  
  try {
    args = parseArgs({
      args: argv,
      options: {
        'vault-path': { type: 'string' },
        'inbox-subdir': { type: 'string' },
        'skip-open': { type: 'boolean', default: false },
        'help': { type: 'boolean', default: false },
      },
      allowPositionals: true,
    }) as CliArgs;
  } catch (error) {
    console.error('Error parsing arguments:', (error as Error).message);
    console.log(USAGE);
    process.exit(1);
  }

  if (args.values.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (args.positionals.length === 0) {
    console.error('Error: Screenshot path is required');
    console.log(USAGE);
    process.exit(1);
  }

  if (!args.values['vault-path']) {
    console.error('Error: --vault-path is required');
    console.log(USAGE);
    process.exit(1);
  }

  const screenshotPath = args.positionals[0];
  const config: CaptureConfig = {
    vaultPath: args.values['vault-path'],
    inboxSubdir: args.values['inbox-subdir'] || 'inbox',
    skipOpen: args.values['skip-open'],
  };

  try {
    const result = await captureScreenshot(screenshotPath, config);
    
    console.log('✓ Capture successful');
    console.log(`  Image saved: ${result.imagePath}`);
    console.log(`  Card saved: ${result.cardPath}`);
    
    if (config.skipOpen) {
      console.log('  Obsidian open: skipped');
    } else if (result.opened) {
      console.log('  Obsidian open: URI launched (verify manually that Obsidian opened)');
    } else {
      console.log('  Obsidian open: URI launch attempted but failed');
      console.error('  Note: This may happen if Obsidian is not installed or the URI protocol is not registered');
    }
    
    process.exit(0);
  } catch (error) {
    const err = error as Error & { code?: string };
    console.error('✗ Capture failed:', err.message);
    
    if (err.code === 'FILE_NOT_FOUND') {
      console.error('  The screenshot file does not exist or is not readable');
    } else if (err.code === 'VAULT_NOT_FOUND') {
      console.error('  The vault directory does not exist');
      console.error('  Please create the vault directory or check the path');
    } else if (err.code === 'PATH_ESCAPE') {
      console.error('  The configured path attempts to escape the vault directory');
      console.error('  This is a security error - check your --inbox-subdir setting');
    } else if (err.code === 'RELATIVE_PATH') {
      console.error('  Paths must be absolute');
      console.error('  Use full paths like C:\\\\Users\\\\user\\\\vault (Windows) or /home/user/vault (Unix)');
    }
    
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
