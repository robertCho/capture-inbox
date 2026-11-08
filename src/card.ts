import { readCardSessionId } from './provenance.js';

const MY_NOTES_HEADING = '## My Notes';
const OCR_HEADING = '## OCR Text';

export function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function generateCardContent(imageRef: string, sessionId?: string | null): string {
  const timestamp = new Date().toISOString();
  const sessionLine = sessionId ? `claudeCodeSessionId: ${yamlQuote(sessionId)}\n` : '';

  return `---
created: ${timestamp}
tags: [capture, inbox]
${sessionLine}---

# Capture ${timestamp.split('T')[0]}

![Screenshot](${imageRef})

${MY_NOTES_HEADING}

${OCR_HEADING}
*Not yet implemented*

## AI Summary
*Not yet implemented*
`;
}

/**
 * Insert a new image without rewriting user text, My Notes, OCR, or frontmatter.
 * Prefer inserting before My Notes so screenshots stay grouped.
 * Legacy cards without My Notes keep the previous "before OCR / else end" behavior.
 */
export function appendImageToCard(currentContent: string, imageRef: string): string {
  const newImageLine = `\n![Screenshot](${imageRef})\n`;
  const notesIndex = currentContent.indexOf(MY_NOTES_HEADING);
  if (notesIndex !== -1) {
    return currentContent.slice(0, notesIndex) + newImageLine + '\n' + currentContent.slice(notesIndex);
  }

  const ocrIndex = currentContent.indexOf(OCR_HEADING);
  if (ocrIndex !== -1) {
    return currentContent.slice(0, ocrIndex) + newImageLine + '\n' + currentContent.slice(ocrIndex);
  }

  return currentContent.trimEnd() + '\n' + newImageLine;
}

export function extractMyNotesSection(cardContent: string): string | null {
  const start = cardContent.indexOf(MY_NOTES_HEADING);
  if (start === -1) {
    return null;
  }

  const afterHeading = start + MY_NOTES_HEADING.length;
  const rest = cardContent.slice(afterHeading);
  const nextHeading = rest.search(/\n## /);
  if (nextHeading === -1) {
    return cardContent.slice(start);
  }
  return cardContent.slice(start, afterHeading + nextHeading);
}

export { readCardSessionId, MY_NOTES_HEADING, OCR_HEADING };
