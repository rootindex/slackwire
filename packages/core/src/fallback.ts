const FALLBACK_CAP = 150;

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

function extractText(obj: JsonObject): string {
  const text = obj['text'];
  if (typeof text === 'string') return text;
  if (text !== null && typeof text === 'object' && !Array.isArray(text)) {
    const inner = (text as JsonObject)['text'];
    if (typeof inner === 'string') return inner;
  }
  return '';
}

function stripMrkdwn(text: string): string {
  return text
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~([^~]+)~/g, '$1')
    .replace(/`[^`]+`/g, '')
    .replace(/<[^|>]+\|([^>]+)>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/:\w+:/g, '');
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#124;/g, '|');
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractBlocksFromAttachments(attachments: JsonValue[]): JsonValue[] {
  for (const att of attachments) {
    if (att === null || typeof att !== 'object' || Array.isArray(att)) continue;
    const attObj = att as JsonObject;
    const attBlocks = attObj['blocks'];
    if (Array.isArray(attBlocks)) return attBlocks as JsonValue[];
  }
  return [];
}

export function deriveFallback(blocks: JsonValue[], attachments?: JsonValue[]): string {
  const effectiveBlocks = blocks.length === 0 && attachments && attachments.length > 0
    ? extractBlocksFromAttachments(attachments)
    : blocks;

  const parts: string[] = [];

  for (const block of effectiveBlocks) {
    if (block === null || typeof block !== 'object' || Array.isArray(block)) continue;
    const obj = block as JsonObject;
    const type = obj['type'];

    if (type === 'header') {
      const raw = extractText(obj);
      if (raw) parts.push(decodeEntities(collapseWhitespace(stripMrkdwn(raw))));
      continue;
    }

    if (type === 'section') {
      const raw = extractText(obj);
      if (raw) parts.push(decodeEntities(collapseWhitespace(stripMrkdwn(raw))));

      const fields = obj['fields'];
      if (Array.isArray(fields)) {
        for (const field of fields) {
          if (field !== null && typeof field === 'object' && !Array.isArray(field)) {
            const fieldText = (field as JsonObject)['text'];
            if (typeof fieldText === 'string') {
              parts.push(decodeEntities(collapseWhitespace(stripMrkdwn(fieldText))));
            }
          }
        }
      }
      break;
    }
  }

  const joined = parts.join(' ');
  return joined.length > FALLBACK_CAP ? joined.slice(0, FALLBACK_CAP) : joined;
}
