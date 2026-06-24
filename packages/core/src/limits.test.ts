import { describe, it, expect } from 'vitest';
import { validateLimits } from './limits.js';
import { LimitError } from './errors.js';

const SOFT_TOTAL = 38000;

describe('validateLimits', () => {
  it('measures lengths in UTF-16 units after escaping', () => {
    const emoji = '😀';
    expect(emoji.length).toBe(2);

    const textWith2999Emoji = emoji.repeat(1499) + 'a';
    expect(textWith2999Emoji.length).toBe(2999);
    const blocks2999 = [{ type: 'section', text: { type: 'mrkdwn', text: textWith2999Emoji } }];
    expect(() => validateLimits({ blocks: blocks2999, attachments: [] })).not.toThrow();

    const textWith3001Chars = emoji.repeat(1500) + 'a';
    expect(textWith3001Chars.length).toBe(3001);
    const blocks3001 = [{ type: 'section', text: { type: 'mrkdwn', text: textWith3001Chars } }];
    expect(() => validateLimits({ blocks: blocks3001, attachments: [] })).toThrow(LimitError);
  });

  it('fails at the soft 38000 total budgeted for the largest morph state', () => {
    const chunkSize = 3000;
    const numBlocks = Math.ceil(SOFT_TOTAL / chunkSize) + 1;
    const blocks = Array.from({ length: numBlocks }, () => ({
      type: 'section',
      text: { type: 'mrkdwn', text: 'a'.repeat(chunkSize) },
    }));
    const morphStates = [blocks];
    expect(() => validateLimits({ blocks: [], attachments: [], morphStates })).toThrow(LimitError);
    expect(() => validateLimits({ blocks: [], attachments: [], morphStates })).toThrow('38000');
  });

  it('throws when a button text exceeds 75 or a header exceeds 150', () => {
    const longButtonText = 'b'.repeat(76);
    const buttonBlocks = [
      {
        type: 'actions',
        elements: [{ type: 'button', text: { type: 'plain_text', text: longButtonText } }],
      },
    ];
    expect(() => validateLimits({ blocks: buttonBlocks, attachments: [] })).toThrow(LimitError);
    expect(() => validateLimits({ blocks: buttonBlocks, attachments: [] })).toThrow('75');

    const longHeaderText = 'h'.repeat(151);
    const headerBlocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: longHeaderText },
      },
    ];
    expect(() => validateLimits({ blocks: headerBlocks, attachments: [] })).toThrow(LimitError);
    expect(() => validateLimits({ blocks: headerBlocks, attachments: [] })).toThrow('150');
  });

  it('throws LimitError when a section text exceeds 3000 after escaping', () => {
    const longText = 'a'.repeat(3001);
    const blocks = [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: longText },
      },
    ];
    expect(() => validateLimits({ blocks, attachments: [] })).toThrow(LimitError);
    expect(() => validateLimits({ blocks, attachments: [] })).toThrow('3000');
  });
});
