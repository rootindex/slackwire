import { join } from 'node:path';
import { StructuralError } from './errors.js';
import type { PlaceholderKind } from './types.js';

export interface FsAdapter {
  readFile(path: string): string;
  listDirs(path: string): string[];
}

export interface TemplateMeta {
  name: string;
  version: string;
  description?: string;
}

export type TemplateSchema = Record<string, PlaceholderKind>;

export type TemplateSkeleton = Record<string, unknown>;

export interface TemplateBundle {
  meta: TemplateMeta;
  schema: TemplateSchema;
  skeleton: TemplateSkeleton;
}

export interface TemplateSummary {
  name: string;
  version: string;
}

const REQUIRED_FILES = ['skeleton.json', 'schema.json', 'meta.json'] as const;

function readJson(fs: FsAdapter, path: string, filename: string): unknown {
  try {
    return JSON.parse(fs.readFile(join(path, filename))) as unknown;
  } catch (cause) {
    throw new StructuralError(`Missing or invalid ${filename} in ${path}: ${String(cause)}`);
  }
}

export function loadTemplate(
  catalogPath: string,
  name: string,
  version: string,
  fs: FsAdapter,
): TemplateBundle {
  const templatePath = join(catalogPath, name, version);

  for (const file of REQUIRED_FILES) {
    readJson(fs, templatePath, file);
  }

  const meta = readJson(fs, templatePath, 'meta.json') as TemplateMeta;
  const schema = readJson(fs, templatePath, 'schema.json') as TemplateSchema;
  const skeleton = readJson(fs, templatePath, 'skeleton.json') as TemplateSkeleton;

  return { meta, schema, skeleton };
}

export function listTemplates(catalogPath: string, fs: FsAdapter): TemplateSummary[] {
  const names = fs.listDirs(catalogPath);
  const summaries: TemplateSummary[] = [];

  for (const name of names) {
    const versions = fs.listDirs(join(catalogPath, name));
    for (const version of versions) {
      summaries.push({ name, version });
    }
  }

  return summaries;
}

const TOKEN_PATTERN = /\{\{(\w+)\}\}/g;

function extractTokensFromValue(value: unknown, tokens: Set<string>): void {
  if (typeof value === 'string') {
    for (const match of value.matchAll(TOKEN_PATTERN)) {
      if (match[1] !== undefined) tokens.add(match[1]);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      extractTokensFromValue(item, tokens);
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value as Record<string, unknown>)) {
      extractTokensFromValue(v, tokens);
    }
  }
}

export function placeholderTokens(skeleton: TemplateSkeleton): Set<string> {
  const tokens = new Set<string>();
  extractTokensFromValue(skeleton, tokens);
  return tokens;
}

export function selectTemplate(
  catalogPath: string,
  name: string,
  version: string,
  fs: FsAdapter,
): TemplateBundle {
  return loadTemplate(catalogPath, name, version, fs);
}
