import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkLeaves } from './leaf-check.js';
import type { TemplateSkeleton, TemplateSchema } from './loader.js';

const AVAILABLE_PARTIALS = new Set(['header', 'footer', 'button-row', 'field-grid', 'icon-section']);

describe('leaf-check', () => {
  it('fails when a skeleton token has no matching schema leaf', () => {
    const skeleton: TemplateSkeleton = {
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '{{text_plain:status}} {{text_plain:missing_field}}' } },
      ],
    };
    const schema: TemplateSchema = {
      status: 'text_plain',
    };

    const result = checkLeaves(skeleton, schema, AVAILABLE_PARTIALS);
    expect(result.ok).toBe(false);
    expect(result.missingTokens).toContain('missing_field');
  });

  it('passes when all skeleton tokens resolve to schema leaves', () => {
    const skeleton: TemplateSkeleton = {
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '{{text_plain:status}}' } },
        { '$use': 'header' },
        { '$use': 'footer' },
      ],
    };
    const schema: TemplateSchema = {
      status: 'text_plain',
    };

    const result = checkLeaves(skeleton, schema, AVAILABLE_PARTIALS);
    expect(result.ok).toBe(true);
    expect(result.missingTokens).toHaveLength(0);
    expect(result.missingPartials).toHaveLength(0);
  });

  it('flags a missing partial reference', () => {
    const skeleton: TemplateSkeleton = {
      blocks: [
        { '$use': 'nonexistent-partial' },
        { type: 'section', text: { type: 'mrkdwn', text: '{{text_plain:status}}' } },
      ],
    };
    const schema: TemplateSchema = {
      status: 'text_plain',
    };

    const result = checkLeaves(skeleton, schema, AVAILABLE_PARTIALS);
    expect(result.ok).toBe(false);
    expect(result.missingPartials).toContain('nonexistent-partial');
  });

  it('passes the leaf-check for both real templates', () => {
    const rootDir = resolve(import.meta.dirname, '../../../');
    const templatesDir = resolve(rootDir, 'templates');
    const partialsDir = resolve(rootDir, 'templates/partials');

    const partialNames = new Set(
      readdirSync(partialsDir, { withFileTypes: true })
        .filter(e => e.isFile() && e.name.endsWith('.json'))
        .map(e => e.name.replace(/\.json$/, '')),
    );

    for (const templateName of ['ci-cd', 'incident']) {
      const versionDir = resolve(templatesDir, templateName, '1.0.0');
      const skeleton = JSON.parse(readFileSync(resolve(versionDir, 'skeleton.json'), 'utf8')) as TemplateSkeleton;
      const schema = JSON.parse(readFileSync(resolve(versionDir, 'schema.json'), 'utf8')) as TemplateSchema;
      const result = checkLeaves(skeleton, schema, partialNames);
      expect(result.ok, `leaf-check failed for ${templateName}: tokens=${result.missingTokens.join(',')} partials=${result.missingPartials.join(',')}`).toBe(true);
    }
  });
});
