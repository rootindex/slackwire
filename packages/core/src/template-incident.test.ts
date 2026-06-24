import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from './render.js';
import { SchemaError } from './errors.js';
import type { FsAdapter } from './loader.js';

const rootDir = resolve(import.meta.dirname, '../../../');
const catalogPath = resolve(rootDir, 'templates');
const partialsDir = resolve(rootDir, 'templates/partials');

function makeNodeFs(): FsAdapter {
  return {
    readFile: (path: string) => readFileSync(path, 'utf8'),
    listDirs: (path: string) =>
      readdirSync(path, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name),
  };
}

function loadPartials(dir: string, fs: FsAdapter): Record<string, object[]> {
  const entries = readdirSync(dir, { withFileTypes: true }).filter(
    e => e.isFile() && e.name.endsWith('.json'),
  );
  const result: Record<string, object[]> = {};
  for (const entry of entries) {
    const name = entry.name.replace(/\.json$/, '');
    result[name] = JSON.parse(fs.readFile(resolve(dir, entry.name))) as object[];
  }
  return result;
}

const TRIGGERED_PAYLOAD = {
  title: 'Database connection pool exhausted',
  severity: 'TRIGGERED',
  accent: '#e01e5a',
  incident_id: 'INC-001',
  service: 'payments-api',
  runbook_url: 'https://example.com/runbooks/db-pool',
  assigned_to: 'on-call-team',
};

const MITIGATING_PAYLOAD = {
  title: 'Database connection pool exhausted',
  severity: 'MITIGATING',
  accent: '#ecb22e',
  incident_id: 'INC-001',
  service: 'payments-api',
  runbook_url: 'https://example.com/runbooks/db-pool',
  assigned_to: 'on-call-team',
};

const RESOLVED_PAYLOAD = {
  title: 'Database connection pool exhausted',
  severity: 'RESOLVED',
  accent: '#2eb67d',
  incident_id: 'INC-001',
  service: 'payments-api',
  runbook_url: 'https://example.com/runbooks/db-pool',
  assigned_to: 'on-call-team',
};

const TEMPLATE_REF = { catalogPath, name: 'incident', version: '1.0.0' };

describe('template: incident/1.0.0', () => {
  it('renders the TRIGGERED state with the incident accent', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(partialsDir, fs);
    const result = render(TEMPLATE_REF, TRIGGERED_PAYLOAD, {
      fs,
      partials,
      themeToken: '#e01e5a',
      attribution: true,
    });

    const output = JSON.stringify(result);
    expect(output).toContain('#e01e5a');
    expect(output).toContain('TRIGGERED');
  });

  it('morphs to MITIGATING then RESOLVED on the same template', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(partialsDir, fs);

    const mitigating = render(TEMPLATE_REF, MITIGATING_PAYLOAD, {
      fs,
      partials,
      themeToken: '#ecb22e',
      attribution: true,
    });
    const resolved = render(TEMPLATE_REF, RESOLVED_PAYLOAD, {
      fs,
      partials,
      themeToken: '#2eb67d',
      attribution: true,
    });

    const mOut = JSON.stringify(mitigating);
    expect(mOut).toContain('#ecb22e');
    expect(mOut).toContain('MITIGATING');

    const rOut = JSON.stringify(resolved);
    expect(rOut).toContain('#2eb67d');
    expect(rOut).toContain('RESOLVED');
  });

  it('renders without an Added by footer by default', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(partialsDir, fs);
    const result = render(TEMPLATE_REF, TRIGGERED_PAYLOAD, {
      fs,
      partials,
      themeToken: '#e01e5a',
      attribution: true,
    });

    const output = JSON.stringify(result);
    expect(output).not.toContain('Added by');
  });

  it('exposes an alert-block variant flag in meta', () => {
    const fs = makeNodeFs();
    const metaPath = resolve(catalogPath, 'incident/1.0.0/meta.json');
    const meta = JSON.parse(fs.readFile(metaPath)) as Record<string, unknown>;
    expect(meta['alertBlockVariant']).toBe(true);
  });

  it('rejects a payload missing the required severity field', () => {
    const fs = makeNodeFs();
    const partials = loadPartials(partialsDir, fs);
    const withoutSeverity: Record<string, unknown> = { ...TRIGGERED_PAYLOAD };
    delete withoutSeverity['severity'];

    expect(() =>
      render(TEMPLATE_REF, withoutSeverity, { fs, partials }),
    ).toThrow(SchemaError);
  });
});
