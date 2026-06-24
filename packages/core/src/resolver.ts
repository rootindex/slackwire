import type { DiskCache } from './cache.js';

interface ConversationsListResponse {
  ok: boolean;
  channels?: Array<{ id?: string; name?: string }>;
  response_metadata?: { next_cursor?: string };
}

interface UsersListResponse {
  ok: boolean;
  members?: Array<{ id?: string; name?: string }>;
  response_metadata?: { next_cursor?: string };
}

interface ResolverClient {
  conversations: {
    list(args: { limit: number; cursor?: string }): Promise<ConversationsListResponse>;
  };
  users: {
    list(args: { limit: number; cursor?: string }): Promise<UsersListResponse>;
  };
}

export class Resolver {
  constructor(
    private readonly client: ResolverClient,
    private readonly cache: DiskCache,
    private readonly teamId: string,
  ) {}

  async resolveChannel(name: string): Promise<string | undefined> {
    const cached = await this.cache.get(this.teamId, 'channel');
    if (cached !== null) {
      return cached[name];
    }
    const map = await this.fetchChannels();
    await this.cache.set(this.teamId, 'channel', map);
    return map[name];
  }

  async resolveUser(name: string): Promise<string | undefined> {
    const cached = await this.cache.get(this.teamId, 'user');
    if (cached !== null) {
      return cached[name];
    }
    const map = await this.fetchUsers();
    await this.cache.set(this.teamId, 'user', map);
    return map[name];
  }

  private async fetchChannels(): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    let cursor: string | undefined;
    do {
      const args: { limit: number; cursor?: string } = { limit: 200 };
      if (cursor) args.cursor = cursor;
      const res = await this.client.conversations.list(args);
      for (const ch of res.channels ?? []) {
        if (ch.name && ch.id) map[ch.name] = ch.id;
      }
      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);
    return map;
  }

  private async fetchUsers(): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    let cursor: string | undefined;
    do {
      const args: { limit: number; cursor?: string } = { limit: 200 };
      if (cursor) args.cursor = cursor;
      const res = await this.client.users.list(args);
      for (const u of res.members ?? []) {
        if (u.name && u.id) map[u.name] = u.id;
      }
      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);
    return map;
  }
}
