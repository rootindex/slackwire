import { describe, it, expect } from 'vitest';
import { escape } from './escaping.js';
import { SchemaError } from './errors.js';

describe('per-kind escaping', () => {
  it('escapes & < > in human mrkdwn and plain_text values', () => {
    expect(escape('text_mrkdwn', 'a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
    expect(escape('text_plain', 'a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('leaves a code block value literal and unescaped', () => {
    expect(escape('code_block', 'a & b < c > d')).toBe('a & b < c > d');
    expect(escape('code', 'x & y')).toBe('x & y');
  });

  it('neutralizes a literal pipe and > inside link text but keeps the <url|text> token valid', () => {
    const result = escape('link_text', 'click | here > now');
    expect(result).not.toContain('|');
    expect(result).not.toContain('>');
    expect(result).toBe('click &#124; here &gt; now');
  });

  it('percent-encodes and scheme-validates a link or image url', () => {
    expect(escape('link_url', 'https://example.com/path with spaces')).toBe('https://example.com/path%20with%20spaces');
    expect(escape('image_url', 'https://example.com/img.png')).toBe('https://example.com/img.png');
    expect(() => escape('link_url', 'javascript:alert(1)')).toThrow(SchemaError);
    expect(() => escape('image_url', 'data:image/png;base64,abc')).toThrow(SchemaError);
  });

  it('writes <@U…> and <!date^epoch^fmt|fallback> without escaping their brackets', () => {
    const user = escape('user_mention', 'U12345678');
    expect(user).toBe('<@U12345678>');

    const channel = escape('channel_mention', 'C12345678');
    expect(channel).toBe('<#C12345678>');

    const date = escape('date', { epoch: 1700000000, format: '{date_short}', fallback: 'Nov 14, 2023' });
    expect(date).toBe('<!date^1700000000^{date_short}|Nov 14, 2023>');
  });

  it('treats the date epoch as integer seconds and rejects a ms-scale value', () => {
    expect(() =>
      escape('date', { epoch: 1700000000000, format: '{date_short}', fallback: 'fallback' })
    ).toThrow(SchemaError);

    const result = escape('date', { epoch: 1700000000, format: '{date_short}', fallback: 'fallback' });
    expect(result).toBe('<!date^1700000000^{date_short}|fallback>');
  });

  it('escapes CI_COMMIT_AUTHOR "Name <email>" to a safe author string', () => {
    const author = 'Jane Doe <jane@example.com>';
    expect(escape('text_mrkdwn', author)).toBe('Jane Doe &lt;jane@example.com&gt;');
    expect(escape('text_plain', author)).toBe('Jane Doe &lt;jane@example.com&gt;');
  });

  it('rejects an unknown placeholder kind', () => {
    expect(() => escape('unknown_kind' as never, 'value')).toThrow(SchemaError);
  });

  it('rejects a mention value carrying an injection payload', () => {
    expect(() => escape('user_mention', 'here>!channel<')).toThrow(SchemaError);
    expect(() => escape('user_mention', '!channel')).toThrow(SchemaError);
    expect(() => escape('channel_mention', 'C123><!everyone')).toThrow(SchemaError);
  });

  it('accepts a well-formed Slack id mention', () => {
    expect(escape('user_mention', 'U123')).toBe('<@U123>');
    expect(escape('channel_mention', 'C123')).toBe('<#C123>');
  });

  it('neutralizes backticks in code and code_block values', () => {
    const codeOut = escape('code', 'rm -rf `whoami`');
    expect(codeOut).not.toContain('`');
    const blockOut = escape('code_block', '```injected```');
    expect(blockOut).not.toContain('`');
  });
});
