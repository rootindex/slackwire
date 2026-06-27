import { Ajv } from 'ajv';
import type { ErrorObject } from 'ajv';
import { SchemaError } from './errors.js';

const BOOLEAN_STRING_MAP: Record<string, boolean> = {
  true: true,
  false: false,
  '1': true,
  '0': false,
};

const ajv = new Ajv({
  useDefaults: true,
  coerceTypes: true,
  allErrors: true,
});

function applyExplicitBooleans(
  schema: Record<string, unknown>,
  data: Record<string, unknown>,
  coercions: string[],
): void {
  const properties = schema['properties'] as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return;

  for (const [key, propSchema] of Object.entries(properties)) {
    if (propSchema['type'] === 'boolean' && typeof data[key] === 'string') {
      const raw = data[key] as string;
      if (raw in BOOLEAN_STRING_MAP) {
        data[key] = BOOLEAN_STRING_MAP[raw];
        coercions.push(`coerced "${key}": "${raw}" -> ${String(BOOLEAN_STRING_MAP[raw])} (boolean)`);
      }
    }
  }
}

function detectNumericCoercions(
  schema: Record<string, unknown>,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  coercions: string[],
): void {
  const properties = schema['properties'] as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return;

  for (const key of Object.keys(properties)) {
    if (typeof before[key] === 'string' && typeof after[key] === 'number') {
      coercions.push(`coerced "${key}": "${String(before[key])}" -> ${String(after[key])} (number)`);
    }
  }
}

export function validatePayload(
  schema: Record<string, unknown>,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const validate = ajv.compile(schema);
  const data = structuredClone(payload);
  const coercions: string[] = [];

  applyExplicitBooleans(schema, data, coercions);

  const beforeNumeric = structuredClone(data);
  const valid = validate(data);

  detectNumericCoercions(schema, beforeNumeric, data, coercions);

  for (const msg of coercions) {
    console.error(msg);
  }

  if (!valid) {
    const messages = (validate.errors ?? []).map((e: ErrorObject) => {
      if (e.keyword === 'additionalProperties') {
        return `unknown field: ${String((e.params as Record<string, unknown>)['additionalProperty'])}`;
      }
      return e.message ?? String(e);
    });
    throw new SchemaError(messages.join('; '));
  }

  return data;
}
