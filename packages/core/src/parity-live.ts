import { readFileSync, existsSync } from 'node:fs';

export function resolveParityToken(): string {
  const raw = process.env['SLACK_TOKEN'];
  if (raw) return raw;

  const b64 = process.env['SLACK_TOKEN_BASE64'];
  if (b64) return Buffer.from(b64, 'base64').toString('utf8');

  const file = process.env['SLACK_TOKEN_FILE'] ?? './.slack_token';
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();

  throw new Error('No Slack token resolved for parity live test');
}

export function shouldRunParityLive(): boolean {
  if (process.env['SLACK_PARITY_LIVE'] !== '1') return false;
  try {
    const token = resolveParityToken();
    return Boolean(token);
  } catch {
    return false;
  }
}
