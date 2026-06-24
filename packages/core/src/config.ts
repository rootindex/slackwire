import { readFileSync } from 'node:fs';
import { ConfigError } from './errors.js';

export type TokenType = 'user' | 'bot';

export interface SlackConfig {
  token: string;
  tokenType: TokenType;
  attribution: boolean;
}

function resolveToken(): string {
  const raw = process.env['SLACK_TOKEN'];
  if (raw) return raw;

  const b64 = process.env['SLACK_TOKEN_BASE64'];
  if (b64) return Buffer.from(b64, 'base64').toString('utf8');

  const file = process.env['SLACK_TOKEN_FILE'];
  if (file) return readFileSync(file, 'utf8').trim();

  throw new ConfigError('No Slack token configured');
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
