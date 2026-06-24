const TS_SENTINEL = '__TS__';
const EPOCH_SENTINEL = '__EPOCH__';
const PERMALINK_SENTINEL = '__PERMALINK__';

const DATE_TOKEN_RE = /<!date\^(\d+)\^([^|>]+)\|([^>]+)>/g;
const PERMALINK_RE = /https:\/\/slack\.com\/archives\/[A-Z0-9]+\/p\d+/g;

function normalizeString(value: string): string {
  let result = value.replace(DATE_TOKEN_RE, `<!date^${EPOCH_SENTINEL}^$2|$3>`);
  result = result.replace(PERMALINK_RE, PERMALINK_SENTINEL);
  return result;
}

export function normalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string') return normalizeString(value);
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(obj)) {
    if (key === 'block_id' || key === 'action_id') continue;
    if (key === 'ts' && typeof obj[key] === 'string') {
      result[key] = TS_SENTINEL;
      continue;
    }
    result[key] = normalize(obj[key]);
  }

  return result;
}

function deepEqualOrderIndependent(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqualOrderIndependent(item, b[i]));
  }

  if (Array.isArray(a) || Array.isArray(b)) return false;

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj).sort();
    const bKeys = Object.keys(bObj).sort();
    if (aKeys.length !== bKeys.length) return false;
    if (!aKeys.every((k, i) => k === bKeys[i])) return false;
    return aKeys.every(k => deepEqualOrderIndependent(aObj[k], bObj[k]));
  }

  return false;
}

function findFirstDivergence(
  expected: unknown,
  actual: unknown,
  path: string,
): string | null {
  if (deepEqualOrderIndependent(expected, actual)) return null;

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const len = Math.max(expected.length, actual.length);
    for (let i = 0; i < len; i++) {
      const child = findFirstDivergence(expected[i], actual[i], `${path}[${i}]`);
      if (child !== null) return child;
    }
    return `${path}: array lengths differ (expected ${expected.length}, actual ${actual.length})`;
  }

  if (
    expected !== null &&
    actual !== null &&
    typeof expected === 'object' &&
    typeof actual === 'object' &&
    !Array.isArray(expected) &&
    !Array.isArray(actual)
  ) {
    const eObj = expected as Record<string, unknown>;
    const aObj = actual as Record<string, unknown>;
    const keys = new Set([...Object.keys(eObj), ...Object.keys(aObj)]);
    for (const k of keys) {
      const childPath = path ? `${path}.${k}` : k;
      const child = findFirstDivergence(eObj[k], aObj[k], childPath);
      if (child !== null) return child;
    }
  }

  return `${path}: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`;
}

export function parityDiff(expected: unknown, actual: unknown): string | null {
  const normExpected = normalize(expected);
  const normActual = normalize(actual);
  if (deepEqualOrderIndependent(normExpected, normActual)) return null;
  return findFirstDivergence(normExpected, normActual, '');
}
