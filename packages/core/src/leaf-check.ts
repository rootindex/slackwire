import type { TemplateSkeleton, TemplateSchema } from './loader.js';

export interface LeafCheckResult {
  ok: boolean;
  missingTokens: string[];
  missingPartials: string[];
}

const TYPED_TOKEN_PATTERN = /\{\{[a-z_]+:([^}]+)\}\}/g;
const PARTIAL_REF_PATTERN = /"\$use"\s*:\s*"([^"]+)"/g;

function extractTypedTokenKeys(skeleton: TemplateSkeleton): Set<string> {
  const json = JSON.stringify(skeleton);
  const keys = new Set<string>();
  for (const match of json.matchAll(TYPED_TOKEN_PATTERN)) {
    if (match[1] !== undefined) keys.add(match[1].trim());
  }
  return keys;
}

function extractPartialRefs(skeleton: TemplateSkeleton): Set<string> {
  const json = JSON.stringify(skeleton);
  const refs = new Set<string>();
  for (const match of json.matchAll(PARTIAL_REF_PATTERN)) {
    if (match[1] !== undefined) refs.add(match[1]);
  }
  return refs;
}

export function checkLeaves(
  skeleton: TemplateSkeleton,
  schema: TemplateSchema,
  availablePartials: Set<string>,
): LeafCheckResult {
  const tokens = extractTypedTokenKeys(skeleton);
  const missingTokens: string[] = [];
  for (const token of tokens) {
    if (!(token in schema)) {
      missingTokens.push(token);
    }
  }

  const partialRefs = extractPartialRefs(skeleton);
  const missingPartials: string[] = [];
  for (const ref of partialRefs) {
    if (!availablePartials.has(ref)) {
      missingPartials.push(ref);
    }
  }

  return {
    ok: missingTokens.length === 0 && missingPartials.length === 0,
    missingTokens,
    missingPartials,
  };
}
