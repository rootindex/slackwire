import { describe, it, expect } from 'vitest';
import { interpolate } from './interpolate.js';
import { SchemaError } from './errors.js';

describe('interpolate', () => {
  it('dispatches each token to the renderer for its declared kind', () => {
    const skeleton = {
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '{{text_mrkdwn:message}} by {{user_mention:author}}' },
        },
      ],
    };
    const payload: Record<string, unknown> = {
      message: 'Hello & World',
      author: 'U12345678',
    };
    const schema: Record<string, string> = {
      message: 'text_mrkdwn',
      author: 'user_mention',
    };
    const result = interpolate(skeleton, payload, schema);
    const text = (result.blocks as { text: { text: string } }[])[0]!.text.text;
    expect(text).toBe('Hello &amp; World by <@U12345678>');
  });

  it('leaves structural tokens intact after interpolation', () => {
    const skeleton = {
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '{{text_mrkdwn:title}}' } },
        { type: 'divider' },
      ],
    };
    const payload: Record<string, unknown> = { title: 'My Title' };
    const schema: Record<string, string> = { title: 'text_mrkdwn' };
    const result = interpolate(skeleton, payload, schema);
    expect((result.blocks as unknown[])[1]).toEqual({ type: 'divider' });
  });

  it('errors on a bare untyped placeholder', () => {
    const skeleton = {
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '{{message}}' } }],
    };
    const payload: Record<string, unknown> = { message: 'Hi' };
    const schema: Record<string, string> = {};
    expect(() => interpolate(skeleton, payload, schema)).toThrow(SchemaError);
    expect(() => interpolate(skeleton, payload, schema)).toThrow(/bare.*untyped|untyped.*placeholder|{{message}}/i);
  });

  it('rejects a ms-scale date epoch and emits integer seconds', () => {
    const skeleton = {
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '{{date:ts}}' } }],
    };
    const payload: Record<string, unknown> = {
      ts: { epoch: 1700000000000, format: '{date_short}', fallback: 'Nov 2023' },
    };
    const schema: Record<string, string> = { ts: 'date' };
    expect(() => interpolate(skeleton, payload, schema)).toThrow(SchemaError);
  });

  it('resolves tokens and returns raw blocks without applying accent', () => {
    const skeleton = {
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '{{text_mrkdwn:body}}' } },
      ],
    };
    const payload: Record<string, unknown> = { body: 'alert' };
    const schema: Record<string, string> = { body: 'text_mrkdwn' };
    const result = interpolate(skeleton, payload, schema);
    expect(result.blocks).toHaveLength(1);
    expect(result.attachments).toEqual([]);
  });

  it('throws on a residual malformed placeholder such as an uppercase kind', () => {
    const skeleton = {
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '{{TEXT:message}}' } }],
    };
    const payload: Record<string, unknown> = { message: 'Hi' };
    const schema: Record<string, string> = { message: 'text_mrkdwn' };
    expect(() => interpolate(skeleton, payload, schema)).toThrow(SchemaError);
    expect(() => interpolate(skeleton, payload, schema)).toThrow(/\{\{TEXT:message\}\}|Unresolved/);
  });
});
