import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ParityCase {
  card: string;
  version: string;
  state: string;
  rawPath: string;
  dataPath: string;
  optsPath: string | null;
}

export function discoverParityCases(catalogPath: string): ParityCase[] {
  const cases: ParityCase[] = [];

  if (!existsSync(catalogPath)) return cases;

  const cardNames = readdirSync(catalogPath, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== 'partials')
    .map(e => e.name);

  for (const card of cardNames) {
    const cardDir = join(catalogPath, card);
    const versionDirs = readdirSync(cardDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== '__golden__')
      .map(e => e.name);

    for (const version of versionDirs) {
      const parityDir = join(cardDir, version, '__parity__');
      if (!existsSync(parityDir)) continue;

      const rawFiles = readdirSync(parityDir, { withFileTypes: true })
        .filter(e => e.isFile() && e.name.endsWith('.raw.json'))
        .map(e => e.name);

      for (const rawFile of rawFiles) {
        const state = rawFile.replace(/\.raw\.json$/, '');
        const dataPath = join(parityDir, `${state}.data.json`);
        const optsPath = join(parityDir, `${state}.opts.json`);

        if (!existsSync(dataPath)) {
          throw new Error(
            `Parity fixture missing data file for state "${state}" in ${parityDir}. ` +
              `Found ${rawFile} but no ${state}.data.json`,
          );
        }

        cases.push({
          card,
          version,
          state,
          rawPath: join(parityDir, rawFile),
          dataPath,
          optsPath: existsSync(optsPath) ? optsPath : null,
        });
      }

      const dataFiles = readdirSync(parityDir, { withFileTypes: true })
        .filter(e => e.isFile() && e.name.endsWith('.data.json'))
        .map(e => e.name);

      for (const dataFile of dataFiles) {
        const state = dataFile.replace(/\.data\.json$/, '');
        const rawPath = join(parityDir, `${state}.raw.json`);
        if (!existsSync(rawPath)) {
          throw new Error(
            `Parity fixture missing raw file for state "${state}" in ${parityDir}. ` +
              `Found ${dataFile} but no ${state}.raw.json`,
          );
        }
      }
    }
  }

  return cases;
}
