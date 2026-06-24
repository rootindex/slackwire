import { loadTemplate } from './loader.js';
import type { FsAdapter } from './loader.js';
import { validatePayload } from './validate.js';
import { interpolate } from './interpolate.js';
import type { InterpolateResult } from './interpolate.js';
import { assemble } from './assemble.js';
import type { AssembleResult } from './assemble.js';
import { applyAccent } from './accent.js';
import { validateStructural } from './structural.js';
import { deriveFallback } from './fallback.js';
import { validateLimits } from './limits.js';

type JsonValue = InterpolateResult['blocks'][number];

export interface TemplateRef {
  catalogPath: string;
  name: string;
  version: string;
}

export interface RenderOptions {
  fs: FsAdapter;
  dryRun?: boolean;
  partials?: Record<string, object[]>;
  themeToken?: string;
  attribution?: boolean;
}

export interface RenderResult {
  blocks: object[];
  attachments: object[];
  text: string;
}

const DATE_SUBSCHEMA = {
  type: 'object',
  properties: {
    epoch: { type: 'number' },
    format: { type: 'string' },
    fallback: { type: 'string' },
  },
  required: ['epoch', 'format', 'fallback'],
  additionalProperties: false,
} as const;

function kindToSubschema(kind: string): Record<string, unknown> {
  if (kind === 'date') return DATE_SUBSCHEMA;
  return { type: 'string' };
}

export function buildJsonSchema(kindMap: Record<string, string>): Record<string, unknown> {
  const keys = Object.keys(kindMap);
  return {
    type: 'object',
    properties: Object.fromEntries(keys.map(key => [key, kindToSubschema(kindMap[key]!)])),
    required: keys,
    additionalProperties: false,
  };
}

export function render(
  templateRef: TemplateRef,
  payload: Record<string, unknown>,
  options: RenderOptions,
): RenderResult {
  const { catalogPath, name, version } = templateRef;
  const { fs, partials = {}, themeToken, attribution = false } = options;

  const bundle = loadTemplate(catalogPath, name, version, fs);

  const validatedPayload = validatePayload(
    buildJsonSchema(bundle.schema as Record<string, string>),
    payload,
  );

  const interpolated = interpolate(
    bundle.skeleton as { blocks: JsonValue[] },
    validatedPayload,
    bundle.schema as Record<string, string>,
  );

  const assembled = assemble(
    { blocks: interpolated.blocks as AssembleResult['blocks'] },
    validatedPayload,
    partials as Record<string, AssembleResult['blocks']>,
  );

  const accentResult = themeToken !== undefined
    ? applyAccent(assembled.blocks as object[], themeToken, { attribution })
    : { blocks: assembled.blocks as object[], attachments: [] as object[] };

  const blocks = accentResult.blocks;
  const attachments = accentResult.attachments;

  validateStructural({ blocks, attachments });

  const text = deriveFallback(
    blocks as Parameters<typeof deriveFallback>[0],
    attachments as Parameters<typeof deriveFallback>[1],
  );

  validateLimits({ blocks, attachments });

  return { blocks, attachments, text };
}
