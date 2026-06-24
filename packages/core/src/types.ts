export type PlaceholderKind =
  | 'text_mrkdwn'
  | 'text_plain'
  | 'link_url'
  | 'link_text'
  | 'date'
  | 'user_mention'
  | 'channel_mention'
  | 'code'
  | 'code_block'
  | 'color'
  | 'image_url'
  | 'button';

export interface DatePlaceholder {
  epoch: number;
  format: string;
  fallback: string;
}

export type PlaceholderValue = string | DatePlaceholder;
