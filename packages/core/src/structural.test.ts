import { describe, it, expect } from 'vitest';
import { validateStructural } from './structural.js';
import { StructuralError } from './errors.js';

describe('validateStructural', () => {
  it('throws StructuralError with the block index when blocks exceed 50', () => {
    const blocks = Array.from({ length: 51 }, (_, i) => ({
      type: 'section',
      text: { type: 'mrkdwn', text: `block ${i}` },
    }));
    expect(() => validateStructural({ blocks, attachments: [] })).toThrow(StructuralError);
    expect(() => validateStructural({ blocks, attachments: [] })).toThrow('50');
  });

  it('requires alt_text on image elements', () => {
    const blocks = [
      { type: 'image', image_url: 'https://example.com/img.png' },
    ];
    expect(() => validateStructural({ blocks, attachments: [] })).toThrow(StructuralError);
    expect(() => validateStructural({ blocks, attachments: [] })).toThrow('alt_text');
  });

  it('validates the attachment-path color bar when attribution is enabled', () => {
    const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'hello' } }];
    const validAttachment = [{ color: '#ff0000', blocks }];
    expect(() => validateStructural({ blocks: [], attachments: validAttachment })).not.toThrow();

    const badColorAttachment = [{ color: 'red', blocks }];
    expect(() => validateStructural({ blocks: [], attachments: badColorAttachment })).toThrow(StructuralError);
    expect(() => validateStructural({ blocks: [], attachments: badColorAttachment })).toThrow('color');
  });

  it('throws on an unbalanced <url|text> token, invalid <@U…> mention, or non-#rrggbb color', () => {
    const unbalancedLink = [
      { type: 'section', text: { type: 'mrkdwn', text: '<https://example.com no pipe close' } },
    ];
    expect(() => validateStructural({ blocks: unbalancedLink, attachments: [] })).toThrow(StructuralError);

    const invalidMention = [
      { type: 'section', text: { type: 'mrkdwn', text: '<@invalidid>' } },
    ];
    expect(() => validateStructural({ blocks: invalidMention, attachments: [] })).toThrow(StructuralError);

    const badColor = [
      { type: 'section', text: { type: 'mrkdwn', text: 'hello' }, _color: 'red' },
    ];
    expect(() => validateStructural({ blocks: badColor, attachments: [] })).toThrow(StructuralError);
  });

  it('caps attachment blocks at 50 in attribution mode', () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => ({
      type: 'section',
      text: { type: 'mrkdwn', text: `block ${i}` },
    }));
    const attachments = [{ color: '#36c5f0', blocks: tooMany }];
    expect(() => validateStructural({ blocks: [], attachments })).toThrow(StructuralError);
    expect(() => validateStructural({ blocks: [], attachments })).toThrow('50');
  });

  it('requires alt_text on image blocks nested inside an attachment', () => {
    const attachments = [
      { color: '#36c5f0', blocks: [{ type: 'image', image_url: 'https://example.com/i.png' }] },
    ];
    expect(() => validateStructural({ blocks: [], attachments })).toThrow(StructuralError);
    expect(() => validateStructural({ blocks: [], attachments })).toThrow('alt_text');
  });
});
