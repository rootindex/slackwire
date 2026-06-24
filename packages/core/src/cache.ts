import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type EntryType = 'channel' | 'user';

interface CacheEntry {
  teamId: string;
  type: EntryType;
  map: Record<string, string>;
  fetchedAt: number;
}

export class DiskCache {
  constructor(
    private readonly dir: string,
    private readonly ttlSeconds: number,
  ) {}

  async get(teamId: string, type: EntryType): Promise<Record<string, string> | null> {
    const path = this.filePath(teamId, type);
    let entry: CacheEntry;
    try {
      const raw = readFileSync(path, 'utf8');
      entry = JSON.parse(raw) as CacheEntry;
    } catch {
      return null;
    }
    const ageMs = Date.now() - entry.fetchedAt;
    if (ageMs > this.ttlSeconds * 1000) {
      return null;
    }
    return entry.map;
  }

  async set(teamId: string, type: EntryType, map: Record<string, string>): Promise<void> {
    return this.setWithTime(teamId, type, map, Date.now());
  }

  async setWithTime(
    teamId: string,
    type: EntryType,
    map: Record<string, string>,
    fetchedAt: number,
  ): Promise<void> {
    mkdirSync(this.dir, { recursive: true });
    const entry: CacheEntry = { teamId, type, map, fetchedAt };
    writeFileSync(this.filePath(teamId, type), JSON.stringify(entry));
  }

  private filePath(teamId: string, type: EntryType): string {
    return join(this.dir, `${teamId}-${type}.json`);
  }
}
