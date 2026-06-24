import { StructuralError } from './errors.js';

const FIELD_GRID_CHUNK = 10;
const BUTTON_ROW_MAX = 3;

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

export interface AssembleResult {
  blocks: JsonValue[];
}

function resolvePath(ctx: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = ctx;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function substituteTokens(value: JsonValue, scopeCtx: Record<string, unknown>): JsonValue {
  if (typeof value === 'string') {
    return value.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
      const resolved = resolvePath(scopeCtx, path.trim());
      return resolved !== undefined && resolved !== null ? String(resolved) : '';
    });
  }
  if (Array.isArray(value)) {
    return value.map(v => substituteTokens(v, scopeCtx));
  }
  if (value !== null && typeof value === 'object') {
    const result: JsonObject = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = substituteTokens(v, scopeCtx);
    }
    return result;
  }
  return value;
}

function chunkFieldGrid(block: JsonObject): JsonObject[] {
  const fields = block['fields'];
  if (!Array.isArray(fields)) return [block];

  const chunks: JsonObject[] = [];
  for (let i = 0; i < fields.length; i += FIELD_GRID_CHUNK) {
    chunks.push({ ...block, fields: fields.slice(i, i + FIELD_GRID_CHUNK) as JsonArray });
  }
  return chunks;
}

function pruneButtonRow(block: JsonObject): JsonObject {
  const elements = block['elements'];
  if (!Array.isArray(elements)) return block;
  const pruned = elements.filter((el): el is JsonValue => el !== null && el !== undefined);
  return { ...block, elements: pruned.slice(0, BUTTON_ROW_MAX) as JsonArray };
}

function resolvePartial(name: string, partials: Record<string, JsonValue[]>): JsonValue[] {
  const partial = partials[name];
  if (partial === undefined) throw new StructuralError(`Unknown partial: "${name}". Register it in the partials map.`);

  if (name === 'field-grid') {
    const expanded: JsonValue[] = [];
    for (const block of partial) {
      if (block !== null && typeof block === 'object' && !Array.isArray(block)) {
        for (const chunk of chunkFieldGrid(block as JsonObject)) {
          expanded.push(chunk as JsonValue);
        }
      } else {
        expanded.push(block);
      }
    }
    return expanded;
  }

  if (name === 'button-row') {
    return partial.map(block => {
      if (block !== null && typeof block === 'object' && !Array.isArray(block)) {
        return pruneButtonRow(block as JsonObject) as JsonValue;
      }
      return block;
    });
  }

  return partial;
}

function isTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > 0 && value !== 'false' && value !== '0';
  if (typeof value === 'number') return value !== 0;
  if (value === null || value === undefined) return false;
  return true;
}

function processBlock(block: JsonValue, ctx: Record<string, unknown>, partials: Record<string, JsonValue[]>): JsonValue[] {
  if (block === null || typeof block !== 'object' || Array.isArray(block)) {
    return [block];
  }

  const obj = block as JsonObject;

  if ('$use' in obj) {
    const name = obj['$use'] as string;
    return resolvePartial(name, partials);
  }

  if ('$when' in obj) {
    const condition = obj['$when'] as string;
    const value = resolvePath(ctx, condition);
    if (!isTruthy(value)) return [];

    const rest: JsonObject = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k !== '$when') rest[k] = v;
    }
    return [rest as JsonValue];
  }

  if ('$each' in obj) {
    const listPath = obj['$each'] as string;
    const alias = obj['$as'] as string;
    const items = resolvePath(ctx, listPath);

    if (!Array.isArray(items)) return [];

    const template: JsonObject = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k !== '$each' && k !== '$as') template[k] = v;
    }

    return items.map(item => {
      const scopeCtx = { ...ctx, [alias]: item };
      return substituteTokens(template as JsonValue, scopeCtx);
    });
  }

  return [obj as JsonValue];
}

export function assemble(
  skeleton: { blocks: JsonValue[] },
  ctx: Record<string, unknown>,
  partials: Record<string, JsonValue[]>,
): AssembleResult {
  const blocks: JsonValue[] = [];

  for (const block of skeleton.blocks) {
    const processed = processBlock(block, ctx, partials);
    for (const b of processed) {
      blocks.push(b);
    }
  }

  return { blocks };
}
