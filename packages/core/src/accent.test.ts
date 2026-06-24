import { describe, it, expect } from 'vitest';
import { applyAccent } from './accent.js';

const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }];

describe('applyAccent', () => {
  it('returns native-block accent with empty attachments by default', () => {
    const result = applyAccent(blocks, '#36c5f0', { attribution: false });
    expect(result.blocks).toEqual(blocks);
    expect(result.attachments).toEqual([]);
  });

  it('returns a legacy color-bar attachment only when attribution is enabled', () => {
    const result = applyAccent(blocks, '#36c5f0', { attribution: true });
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]).toMatchObject({ color: '#36c5f0', blocks });
    expect(result.blocks).toEqual([]);
  });
});
