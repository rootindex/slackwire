import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assemble } from './assemble.js';
import { StructuralError } from './errors.js';

const rootDir = resolve(import.meta.dirname, '../../../');
const partialsDir = resolve(rootDir, 'templates/partials');

function loadPartial(name: string): object[] {
  return JSON.parse(readFileSync(resolve(partialsDir, `${name}.json`), 'utf8')) as object[];
}

type Block = Record<string, unknown>;
type PartialMap = Record<string, Block[]>;

describe('assemble', () => {
  it('drops a section guarded by a falsy $when value', () => {
    const skeleton = {
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: 'Always shown' } },
        { $when: 'showExtra', type: 'section', text: { type: 'mrkdwn', text: 'Conditional' } },
      ],
    };
    const ctx = { showExtra: false };
    const result = assemble(skeleton, ctx, {});
    expect(result.blocks).toHaveLength(1);
    expect((result.blocks as Block[])[0]!['type']).toBe('section');
  });

  it('repeats a block once per item for an $each directive with scoped tokens', () => {
    const skeleton = {
      blocks: [
        {
          $each: 'items',
          $as: 'item',
          type: 'section',
          text: { type: 'mrkdwn', text: '{{item.name}}' },
        },
      ],
    };
    const ctx = { items: [{ name: 'Alice' }, { name: 'Bob' }] };
    const result = assemble(skeleton, ctx, {});
    expect(result.blocks).toHaveLength(2);
    expect((result.blocks as Block[])[0]!['text']).toEqual({ type: 'mrkdwn', text: 'Alice' });
    expect((result.blocks as Block[])[1]!['text']).toEqual({ type: 'mrkdwn', text: 'Bob' });
  });

  it('includes a named partial via $use', () => {
    const skeleton = {
      blocks: [
        { $use: 'header' },
      ],
    };
    const partials: PartialMap = {
      header: [{ type: 'header', text: { type: 'plain_text', text: 'My Header' } }],
    };
    const result = assemble(skeleton, {}, partials);
    expect(result.blocks).toHaveLength(1);
    expect((result.blocks as Block[])[0]!['type']).toBe('header');
  });

  it('auto-chunks field-grid to <=10 fields in 2-col', () => {
    const fields = Array.from({ length: 13 }, (_, i) => ({
      type: 'mrkdwn',
      text: `Field ${i + 1}`,
    }));
    const skeleton = {
      blocks: [{ $use: 'field-grid' }],
    };
    const partials: PartialMap = {
      'field-grid': [{ type: 'section', fields }],
    };
    const result = assemble(skeleton, {}, partials);
    const blocks = result.blocks as Block[];
    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) {
      const blockFields = block['fields'] as unknown[];
      expect(blockFields.length).toBeLessThanOrEqual(10);
    }
    const totalFields = blocks.reduce((sum, b) => sum + ((b['fields'] as unknown[]).length), 0);
    expect(totalFields).toBe(13);
  });

  it('resolves a $use header marker to the header partial block array', () => {
    const headerPartial = loadPartial('header');
    const skeleton = { blocks: [{ $use: 'header' }] };
    const partials = { header: headerPartial };
    const result = assemble(skeleton, {}, partials);
    expect(result.blocks).toEqual(headerPartial);
    expect(result.blocks.length).toBeGreaterThan(0);
  });

  it('resolves a $use footer marker to the footer partial block array', () => {
    const footerPartial = loadPartial('footer');
    const skeleton = { blocks: [{ $use: 'footer' }] };
    const partials = { footer: footerPartial };
    const result = assemble(skeleton, {}, partials);
    expect(result.blocks).toEqual(footerPartial);
  });

  it('errors on an unknown $use partial name', () => {
    const skeleton = { blocks: [{ $use: 'nonexistent-partial' }] };
    expect(() => assemble(skeleton, {}, {})).toThrow(StructuralError);
  });

  it('self-prunes null buttons in button-row to <=3', () => {
    const actions = [
      { type: 'button', text: { type: 'plain_text', text: 'Approve' } },
      null,
      { type: 'button', text: { type: 'plain_text', text: 'Deny' } },
      null,
      { type: 'button', text: { type: 'plain_text', text: 'Escalate' } },
      { type: 'button', text: { type: 'plain_text', text: 'Extra' } },
    ];
    const skeleton = {
      blocks: [{ $use: 'button-row' }],
    };
    const partials: PartialMap = {
      'button-row': [{ type: 'actions', elements: actions }],
    };
    const result = assemble(skeleton, {}, partials);
    const blocks = result.blocks as Block[];
    expect(blocks).toHaveLength(1);
    const elements = blocks[0]!['elements'] as unknown[];
    expect(elements).toHaveLength(3);
    for (const el of elements) {
      expect(el).not.toBeNull();
    }
  });
});
