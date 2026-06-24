export interface AccentOptions {
  attribution: boolean;
}

export interface AccentResult {
  blocks: object[];
  attachments: object[];
}

export function applyAccent(
  blocks: object[],
  themeToken: string,
  options: AccentOptions,
): AccentResult {
  if (options.attribution) {
    return {
      blocks: [],
      attachments: [{ color: themeToken, blocks }],
    };
  }
  return {
    blocks,
    attachments: [],
  };
}
