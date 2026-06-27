import { readFileSync } from 'node:fs';
import { ConfigError } from './errors.js';

export type TokenType = 'user' | 'bot';

export interface SlackConfig {
  token: string;
  tokenType: TokenType;
  attribution: boolean;
}

export type TokenEnv = Record<string, string | undefined>;

export function resolveTokenFrom(env: TokenEnv): string | undefined {
  const direct = env['SLACK_TOKEN'];
  if (direct) return direct.trim();

  const b64 = env['SLACK_TOKEN_BASE64'];
  if (b64) return Buffer.from(b64, 'base64').toString('utf8').trim();

  const file = env['SLACK_TOKEN_FILE'];
  if (file) return readFileSync(file, 'utf8').trim();

  return undefined;
}

function resolveToken(): string {
  const token = resolveTokenFrom(process.env);
  if (!token) throw new ConfigError('No Slack token configured');
  return token;
}

function resolveTokenType(token: string): TokenType {
  return token.startsWith('xoxp-') ? 'user' : 'bot';
}

export function loadConfig(): SlackConfig {
  const token = resolveToken();
  return {
    token,
    tokenType: resolveTokenType(token),
    attribution: process.env['SLACK_ATTRIBUTION'] === 'true',
  };
}
