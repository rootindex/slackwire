import { SchemaError } from './errors.js';
import type { PlaceholderKind, PlaceholderValue, DatePlaceholder } from './types.js';

const MS_EPOCH_THRESHOLD = 1e12;
const ALLOWED_URL_SCHEMES = ['https:', 'http:'];
const SLACK_ID_PATTERN = /^[UWCGD][A-Z0-9]+$/;
const BACKTICK_LOOKALIKE = 'ˋ';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function neutralizeBackticks(value: string): string {
  return value.replace(/`/g, BACKTICK_LOOKALIKE);
}

function escapeLinkText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/\|/g, '&#124;').replace(/>/g, '&gt;');
}

function validateAndEncodeUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SchemaError(`Invalid URL: ${value}`);
  }
  if (!ALLOWED_URL_SCHEMES.includes(url.protocol)) {
    throw new SchemaError(`Disallowed URL scheme "${url.protocol}" in: ${value}`);
  }
  return url.toString();
}

function isDatePlaceholder(value: PlaceholderValue): value is DatePlaceholder {
  return typeof value === 'object' && value !== null && 'epoch' in value;
}

export function escape(kind: PlaceholderKind, value: PlaceholderValue): string {
  switch (kind) {
    case 'text_mrkdwn':
    case 'text_plain':
      if (typeof value !== 'string') throw new SchemaError(`${kind} requires a string value`);
      return escapeHtml(value);

    case 'code':
    case 'code_block':
      if (typeof value !== 'string') throw new SchemaError(`${kind} requires a string value`);
      return neutralizeBackticks(value);

    case 'link_text':
      if (typeof value !== 'string') throw new SchemaError('link_text requires a string value');
      return escapeLinkText(value);

    case 'link_url':
    case 'image_url':
      if (typeof value !== 'string') throw new SchemaError(`${kind} requires a string value`);
      return validateAndEncodeUrl(value);

    case 'user_mention':
      if (typeof value !== 'string') throw new SchemaError('user_mention requires a string value');
      if (!SLACK_ID_PATTERN.test(value)) {
        throw new SchemaError(`Invalid user id "${value}"; expected a Slack id like U0123ABCD`);
      }
      return `<@${value}>`;

    case 'channel_mention':
      if (typeof value !== 'string') throw new SchemaError('channel_mention requires a string value');
      if (!SLACK_ID_PATTERN.test(value)) {
        throw new SchemaError(`Invalid channel id "${value}"; expected a Slack id like C0123ABCD`);
      }
      return `<#${value}>`;

    case 'date': {
      if (!isDatePlaceholder(value)) throw new SchemaError('date requires a DatePlaceholder object');
      const { epoch, format, fallback } = value;
      if (epoch >= MS_EPOCH_THRESHOLD) {
        throw new SchemaError(
          `date epoch ${epoch} looks like milliseconds; provide integer seconds`,
        );
      }
      return `<!date^${Math.trunc(epoch)}^${format}|${fallback}>`;
    }

    case 'color': {
      if (typeof value !== 'string') throw new SchemaError('color requires a string value');
      if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
        throw new SchemaError(`Invalid color "${value}"; expected #rrggbb`);
      }
      return value;
    }

    case 'button':
      if (typeof value !== 'string') throw new SchemaError('button requires a string value');
      return escapeHtml(value);

    default: {
      const _exhaustive: never = kind;
      throw new SchemaError(`Unknown placeholder kind: ${String(_exhaustive)}`);
    }
  }
}
