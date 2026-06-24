import { escape } from './escaping.js';
import { SchemaError } from './errors.js';
import type { PlaceholderKind, PlaceholderValue } from './types.js';

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

export interface InterpolateOptions {
  themeToken?: string;
  attribution?: boolean;
}

export interface InterpolateResult {
  blocks: JsonValue[];
  attachments: JsonValue[];
}

const TYPED_TOKEN = /\{\{([a-z_]+):([^}]+)\}\}/g;
const BARE_TOKEN = /\{\{([^}]+)\}\}/g;

function interpolateString(
  str: string,
  payload: Record<string, unknown>,
  schema: Record<string, string>,
): string {
  BARE_TOKEN.lastIndex = 0;
  const bareTokens: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = BARE_TOKEN.exec(str)) !== null) {
    const inner = match[1]!.trim();
    if (!inner.includes(':')) {
      bareTokens.push(inner);
    }
  }

  if (bareTokens.length > 0) {
    throw new SchemaError(
      `Bare untyped placeholder(s) found: ${bareTokens.map(t => `{{${t}}}`).join(', ')}. Use {{kind:path}} syntax.`,
    );
  }

  return str.replace(TYPED_TOKEN, (_match, kind: string, path: string) => {
    const key = path.trim();
    const declaredKind = schema[key] ?? kind;
    const rawValue = payload[key];

    if (rawValue === undefined) return '';

    return escape(declaredKind as PlaceholderKind, rawValue as PlaceholderValue);
  });
}

function walkNode(
  node: JsonValue,
  payload: Record<string, unknown>,
  schema: Record<string, string>,
): JsonValue {
  if (typeof node === 'string') {
    return interpolateString(node, payload, schema);
  }
  if (Array.isArray(node)) {
    return node.map(item => walkNode(item, payload, schema));
  }
  if (node !== null && typeof node === 'object') {
    const result: JsonObject = {};
    for (const [key, val] of Object.entries(node)) {
      result[key] = walkNode(val, payload, schema);
    }
    return result;
  }
  return node;
}

export function interpolate(
  skeleton: { blocks: JsonValue[] },
  payload: Record<string, unknown>,
  schema: Record<string, string>,
): InterpolateResult {
  const interpolated = walkNode(skeleton as unknown as JsonValue, payload, schema) as {
    blocks: JsonValue[];
  };

  return { blocks: interpolated.blocks, attachments: [] };
}
