import { describe, it, expect } from 'vitest';
import { normalize, parityDiff } from './parity-normalize.js';

describe('normalize', () => {
  it('removes block_id and action_id from every block recursively', () => {
    const input = {
      blocks: [
        {
          type: 'section',
          block_id: 'B1',
          text: { type: 'mrkdwn', text: 'hello' },
          accessory: {
            type: 'button',
            action_id: 'A1',
            text: { type: 'plain_text', text: 'Click' },
          },
        },
        {
          type: 'actions',
          block_id: 'B2',
          elements: [
            { type: 'button', action_id: 'A2', text: { type: 'plain_text', text: 'Go' } },
          ],
        },
      ],
    };

    const result = normalize(input);

    expect(result).toEqual({
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: 'hello' },
          accessory: {
            type: 'button',
            text: { type: 'plain_text', text: 'Click' },
          },
        },
        {
          type: 'actions',
          elements: [{ type: 'button', text: { type: 'plain_text', text: 'Go' } }],
        },
      ],
    });
  });

  it('normalizes a generated message ts to a stable sentinel', () => {
    const input = { ts: '1700000000.123456', text: 'hi' };
    const result = normalize(input);
    expect(result).toEqual({ ts: '__TS__', text: 'hi' });
  });

  it('normalizes the epoch inside a date token while preserving format and fallback', () => {
    const input = {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Due <!date^1700000000^{date_short}|Jan 1, 2024> please',
          },
        },
      ],
    };
    const result = normalize(input);
    const normalized = result as { blocks: Array<{ text: { text: string } }> };
    expect(normalized.blocks[0].text.text).toBe(
      'Due <!date^__EPOCH__^{date_short}|Jan 1, 2024> please',
    );
  });

  it('normalizes an archive permalink to a stable sentinel', () => {
    const input = {
      text: 'See https://slack.com/archives/C12345/p1700000000123456 for details',
    };
    const result = normalize(input);
    const normalized = result as { text: string };
    expect(normalized.text).toBe('See __PERMALINK__ for details');
  });

  it('reports two payloads as equal regardless of object key order', () => {
    const a = { z: 1, a: 2, m: { x: 3, b: 4 } };
    const b = { a: 2, m: { b: 4, x: 3 }, z: 1 };
    expect(parityDiff(a, b)).toBeNull();
  });

  it('returns a readable diff naming the first divergent path on mismatch', () => {
    const expected = { blocks: [{ type: 'section', text: 'hello' }] };
    const actual = { blocks: [{ type: 'section', text: 'world' }] };
    const diff = parityDiff(expected, actual);
    expect(diff).not.toBeNull();
    expect(diff).toContain('blocks[0].text');
    expect(diff).toContain('hello');
    expect(diff).toContain('world');
  });
});
