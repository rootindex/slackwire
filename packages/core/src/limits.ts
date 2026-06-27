import { LimitError } from './errors.js';

const SECTION_TEXT_MAX = 3000;
const BUTTON_TEXT_MAX = 75;
const HEADER_TEXT_MAX = 150;
const SOFT_TOTAL_MAX = 38000;

export interface RenderOutput {
  blocks: object[];
  attachments: object[];
  morphStates?: object[][];
}

type BlockRecord = Record<string, unknown>;
type TextObject = { type?: string; text?: string };

function isRecord(v: unknown): v is BlockRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isTextObject(v: unknown): v is TextObject {
  return isRecord(v) && ('text' in v || 'type' in v);
}

function checkHeaderText(block: BlockRecord, index: number): void {
  if (block['type'] !== 'header') return;
  const textField = block['text'];
  if (!isTextObject(textField)) return;
  const raw = textField['text'];
  if (typeof raw !== 'string') return;
  if (raw.length > HEADER_TEXT_MAX) {
    throw new LimitError(
      `block[${index}].text.text exceeds 150 characters: ${raw.length}`,
    );
  }
}

function checkButtonText(block: BlockRecord, index: number): void {
  if (block['type'] !== 'actions') return;
  const elements = block['elements'];
  if (!Array.isArray(elements)) return;
  elements.forEach((el, elIdx) => {
    if (!isRecord(el) || el['type'] !== 'button') return;
    const textField = el['text'];
    if (!isTextObject(textField)) return;
    const raw = textField['text'];
    if (typeof raw !== 'string') return;
    if (raw.length > BUTTON_TEXT_MAX) {
      throw new LimitError(
        `block[${index}].elements[${elIdx}].text.text exceeds 75 characters: ${raw.length}`,
      );
    }
  });
}

function checkSectionText(block: BlockRecord, index: number): void {
  if (block['type'] !== 'section') return;
  const textField = block['text'];
  if (!isTextObject(textField)) return;
  const raw = textField['text'];
  if (typeof raw !== 'string') return;
  if (raw.length > SECTION_TEXT_MAX) {
    throw new LimitError(
      `block[${index}].text.text exceeds 3000 characters: ${raw.length}`,
    );
  }
}

function measureBlocks(blocks: object[]): number {
  return JSON.stringify(blocks).length;
}

function checkBlockLengths(blocks: object[]): void {
  blocks.forEach((block, index) => {
    if (!isRecord(block)) return;
    checkSectionText(block, index);
    checkHeaderText(block, index);
    checkButtonText(block, index);
  });
}

function attachmentBlocksOf(attachments: object[]): object[][] {
  const result: object[][] = [];
  for (const attachment of attachments) {
    if (!isRecord(attachment)) continue;
    const blocks = attachment['blocks'];
    if (Array.isArray(blocks)) result.push(blocks as object[]);
  }
  return result;
}

function checkSoftTotal(output: RenderOutput): void {
  const states = output.morphStates ?? [output.blocks];
  const attachmentsSize = measureBlocks(output.attachments);
  let maxSize = 0;
  for (const state of states) {
    const size = measureBlocks(state) + attachmentsSize;
    if (size > maxSize) maxSize = size;
  }
  if (maxSize > SOFT_TOTAL_MAX) {
    throw new LimitError(
      `message payload exceeds soft limit of 38000 characters: largest morph state is ${maxSize}`,
    );
  }
}

export function validateLimits(output: RenderOutput): void {
  checkBlockLengths(output.blocks);
  for (const attachmentBlocks of attachmentBlocksOf(output.attachments)) {
    checkBlockLengths(attachmentBlocks);
  }
  checkSoftTotal(output);
}
