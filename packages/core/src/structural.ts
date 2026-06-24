import { StructuralError } from './errors.js';

export interface RenderOutput {
  blocks: object[];
  attachments: object[];
}

type BlockRecord = Record<string, unknown>;

function isRecord(v: unknown): v is BlockRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const LINK_TOKEN_RE = /<[^>]*>/g;
const VALID_MENTION_USER_RE = /^<@U[A-Z0-9]+>$/;
const VALID_MENTION_CHANNEL_RE = /^<#C[A-Z0-9]+>$/;
const VALID_DATE_RE = /^<!date\^/;
const VALID_LINK_RE = /^<https?:\/\/[^|>]+\|[^>]+>$/;

function validateMrkdwnText(text: string, field: string): void {
  const openCount = (text.match(/</g) ?? []).length;
  const closeCount = (text.match(/>/g) ?? []).length;
  if (openCount !== closeCount) {
    throw new StructuralError(`${field} contains unbalanced angle brackets`);
  }

  const tokens = text.match(LINK_TOKEN_RE);
  if (!tokens) return;

  for (const token of tokens) {
    if (VALID_MENTION_USER_RE.test(token)) continue;
    if (VALID_MENTION_CHANNEL_RE.test(token)) continue;
    if (VALID_DATE_RE.test(token)) continue;
    if (token.startsWith('<@') || token.startsWith('<#')) {
      throw new StructuralError(`${field} contains invalid mention token: ${token}`);
    }
    if (token.includes('|')) {
      if (!VALID_LINK_RE.test(token)) {
        throw new StructuralError(`${field} contains unbalanced link token: ${token}`);
      }
    } else if (token.startsWith('<http')) {
      throw new StructuralError(`${field} contains unbalanced link token: ${token}`);
    }
  }
}

function validateColorField(value: unknown, field: string): void {
  if (typeof value !== 'string') return;
  if (!COLOR_RE.test(value)) {
    throw new StructuralError(`${field} has invalid color "${value}"; expected #rrggbb`);
  }
}

function walkAndValidate(obj: unknown, path: string): void {
  if (typeof obj === 'string') {
    if (obj.includes('<') || obj.includes('>')) {
      validateMrkdwnText(obj, path);
    }
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => walkAndValidate(item, `${path}[${i}]`));
    return;
  }
  if (isRecord(obj)) {
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'color' || key === '_color') {
        validateColorField(value, `${path}.${key}`);
      } else {
        walkAndValidate(value, `${path}.${key}`);
      }
    }
  }
}

function checkImageAltText(block: BlockRecord, index: number): void {
  if (block['type'] !== 'image') return;
  if (!block['alt_text'] || (typeof block['alt_text'] === 'string' && block['alt_text'].trim() === '')) {
    throw new StructuralError(`block[${index}] image is missing required alt_text`);
  }
}

export function validateStructural(output: RenderOutput): void {
  if (output.blocks.length > 50) {
    throw new StructuralError(
      `blocks exceed Slack limit of 50: got ${output.blocks.length} blocks`,
    );
  }

  output.blocks.forEach((block, index) => {
    if (!isRecord(block)) return;
    checkImageAltText(block, index);
    walkAndValidate(block, `block[${index}]`);
  });

  output.attachments.forEach((attachment, index) => {
    if (!isRecord(attachment)) return;
    walkAndValidate(attachment, `attachment[${index}]`);
  });
}
