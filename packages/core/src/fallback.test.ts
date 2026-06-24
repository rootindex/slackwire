import { describe, it, expect } from 'vitest';
import { deriveFallback } from './fallback.js';

describe('deriveFallback', () => {
  it('derives fallback text from the header and first section', () => {
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: 'Deploy complete' } },
      { type: 'section', text: { type: 'mrkdwn', text: 'Service *api* is now live.' } },
    ];
    const result = deriveFallback(blocks);
    expect(result).toContain('Deploy complete');
    expect(result).toContain('api');
  });

  it('strips mrkdwn markup from the fallback', () => {
    const blocks = [
      { type: 'section', text: { type: 'mrkdwn', text: '*bold* _italic_ ~strike~ `code` <https://example.com|link text>' } },
    ];
    const result = deriveFallback(blocks);
    expect(result).not.toMatch(/[*_~`]/);
    expect(result).not.toContain('<');
    expect(result).toContain('bold');
    expect(result).toContain('italic');
    expect(result).toContain('link text');
  });

  it('decodes escaped entities back to plain characters', () => {
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: 'Deploy &amp; Release &lt;service&gt;' } },
    ];
    const result = deriveFallback(blocks);
    expect(result).toBe('Deploy & Release <service>');
  });

  it('truncates an overlong fallback to the cap', () => {
    const longText = 'A'.repeat(300);
    const blocks = [
      { type: 'section', text: { type: 'mrkdwn', text: longText } },
    ];
    const result = deriveFallback(blocks);
    expect(result.length).toBeLessThanOrEqual(150);
    expect(result.startsWith('A')).toBe(true);
  });

  it('derives fallback text from attachment blocks when top level blocks are empty', () => {
    const attachmentBlocks = [
      { type: 'header', text: { type: 'plain_text', text: 'Pipeline Status' } },
      { type: 'section', text: { type: 'mrkdwn', text: '*Status:* running' } },
    ];
    const attachments = [{ color: '#ecb22e', blocks: attachmentBlocks }];
    const result = deriveFallback([], attachments);
    expect(result).toContain('Pipeline Status');
    expect(result).toContain('Status:');
  });

  it('prefers top level block text when both top level and attachment blocks exist', () => {
    const topBlocks = [
      { type: 'header', text: { type: 'plain_text', text: 'Top Level Header' } },
    ];
    const attachmentBlocks = [
      { type: 'header', text: { type: 'plain_text', text: 'Attachment Header' } },
    ];
    const attachments = [{ color: '#ecb22e', blocks: attachmentBlocks }];
    const result = deriveFallback(topBlocks, attachments);
    expect(result).toContain('Top Level Header');
    expect(result).not.toContain('Attachment Header');
  });

  it('still derives fallback from top level blocks when no attachment exists', () => {
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: 'No Attachment Header' } },
    ];
    const result = deriveFallback(blocks);
    expect(result).toBe('No Attachment Header');
  });

  it('preserves the existing deriveFallback(blocks) single-argument call signature', () => {
    const blocks = [
      { type: 'section', text: { type: 'mrkdwn', text: 'Single arg call' } },
    ];
    const result = deriveFallback(blocks);
    expect(result).toBe('Single arg call');
  });

  it('strips mrkdwn control sequences from fallback derived from attachment blocks', () => {
    const attachmentBlocks = [
      { type: 'section', text: { type: 'mrkdwn', text: '*bold* _italic_ `code` <https://example.com|link>' } },
    ];
    const attachments = [{ color: '#ecb22e', blocks: attachmentBlocks }];
    const result = deriveFallback([], attachments);
    expect(result).not.toMatch(/[*_`]/);
    expect(result).not.toContain('<');
    expect(result).toContain('bold');
    expect(result).toContain('italic');
    expect(result).toContain('link');
  });

  it('re-derives a different fallback for a morphed state', () => {
    const blocksV1 = [
      { type: 'header', text: { type: 'plain_text', text: 'Build passing' } },
      { type: 'section', text: { type: 'mrkdwn', text: 'All checks green' } },
    ];
    const blocksV2 = [
      { type: 'header', text: { type: 'plain_text', text: 'Build failed' } },
      { type: 'section', text: { type: 'mrkdwn', text: 'Step lint errored' } },
    ];
    const r1 = deriveFallback(blocksV1);
    const r2 = deriveFallback(blocksV2);
    expect(r1).not.toBe(r2);
    expect(r1).toContain('passing');
    expect(r2).toContain('failed');
  });
});
