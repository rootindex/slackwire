import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validatePayload } from './validate.js';
import { SchemaError } from './errors.js';

describe('validatePayload', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('applies schema defaults for omitted optional fields', () => {
    const schema = {
      type: 'object',
      properties: {
        title: { type: 'string' },
        priority: { type: 'string', default: 'normal' },
      },
      additionalProperties: false,
    };

    const result = validatePayload(schema, { title: 'Hello' });

    expect(result['priority']).toBe('normal');
  });

  it('coerces a declared numeric string from CI env to a number', () => {
    const schema = {
      type: 'object',
      properties: {
        retries: { type: 'number' },
      },
      additionalProperties: false,
    };

    const result = validatePayload(schema, { retries: '3' });

    expect(result['retries']).toBe(3);
    expect(typeof result['retries']).toBe('number');
  });

  it('maps the strings true/false/1/0 to booleans explicitly', () => {
    const schema = {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        verbose: { type: 'boolean' },
        flagA: { type: 'boolean' },
        flagB: { type: 'boolean' },
      },
      additionalProperties: false,
    };

    const result = validatePayload(schema, {
      enabled: 'true',
      verbose: 'false',
      flagA: '1',
      flagB: '0',
    });

    expect(result['enabled']).toBe(true);
    expect(result['verbose']).toBe(false);
    expect(result['flagA']).toBe(true);
    expect(result['flagB']).toBe(false);
  });

  it('throws a SchemaError listing all missing required fields', () => {
    const schema = {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        author: { type: 'string' },
      },
      required: ['title', 'body', 'author'],
      additionalProperties: false,
    };

    expect(() => validatePayload(schema, {})).toThrow(SchemaError);

    let caught: unknown;
    try {
      validatePayload(schema, {});
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(SchemaError);
    const msg = (caught as SchemaError).message;
    expect(msg).toContain('title');
    expect(msg).toContain('body');
    expect(msg).toContain('author');
  });

  it('logs each coercion it performs to stderr', () => {
    const schema = {
      type: 'object',
      properties: {
        retries: { type: 'number' },
        enabled: { type: 'boolean' },
      },
      additionalProperties: false,
    };

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    validatePayload(schema, { retries: '5', enabled: 'true' });

    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('retries'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('enabled'));
  });

  it('never writes diagnostics to stdout during validation', () => {
    const schema = {
      type: 'object',
      properties: {
        retries: { type: 'number' },
        enabled: { type: 'boolean' },
      },
      additionalProperties: false,
    };

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    validatePayload(schema, { retries: '5', enabled: 'true' });

    expect(logSpy).not.toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('leaves the validated date object untouched and still coerces sibling scalar fields', () => {
    const schema = {
      type: 'object',
      properties: {
        ts: {
          type: 'object',
          properties: {
            epoch: { type: 'number' },
            format: { type: 'string' },
            fallback: { type: 'string' },
          },
          required: ['epoch', 'format', 'fallback'],
          additionalProperties: false,
        },
        retries: { type: 'number' },
      },
      required: ['ts', 'retries'],
      additionalProperties: false,
    };

    const result = validatePayload(schema, {
      ts: { epoch: 1700000000, format: '{date}', fallback: '2023-11-14' },
      retries: '5',
    });

    const ts = result['ts'] as Record<string, unknown>;
    expect(ts['epoch']).toBe(1700000000);
    expect(typeof ts['epoch']).toBe('number');
    expect(ts['format']).toBe('{date}');
    expect(ts['fallback']).toBe('2023-11-14');
    expect(result['retries']).toBe(5);
    expect(typeof result['retries']).toBe('number');
  });

  it('rejects a payload with an unknown field and reports the field name', () => {
    const schema = {
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
      additionalProperties: false,
    };

    expect(() =>
      validatePayload(schema, { title: 'Hello', unknown_field: 'oops' }),
    ).toThrow(SchemaError);

    expect(() =>
      validatePayload(schema, { title: 'Hello', unknown_field: 'oops' }),
    ).toThrow('unknown_field');
  });
});
