import { WebClient } from '@slack/web-api';

export interface AuthTestResult {
  ok: boolean;
  team_id: string;
  user_id: string;
}

export interface SmokePostResult {
  ts: string;
  channel: string;
}

interface SmokeWebClient {
  auth: { test: () => Promise<Record<string, unknown>> };
  chat: {
    postMessage: (args: { channel: string; text: string }) => Promise<Record<string, unknown>>;
  };
}

function redactToken(message: string, token: string): string {
  if (!token) return message;
  return message.split(token).join('[REDACTED]');
}

export async function runAuthTest(
  token: string,
  client?: WebClient,
): Promise<AuthTestResult> {
  const web = (client ?? new WebClient(token)) as unknown as SmokeWebClient;
  try {
    const res = await web.auth.test();
    return {
      ok: res['ok'] as boolean,
      team_id: res['team_id'] as string,
      user_id: res['user_id'] as string,
    };
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(redactToken(err.message, token));
    }
    throw new Error('unknown error');
  }
}

export async function runSmokePost(
  token: string,
  channel: string,
  client?: WebClient,
): Promise<SmokePostResult> {
  const web = (client ?? new WebClient(token)) as unknown as SmokeWebClient;
  try {
    const res = await web.chat.postMessage({
      channel,
      text: `smoke test ${new Date().toISOString()}`,
    });
    return {
      ts: res['ts'] as string,
      channel: res['channel'] as string,
    };
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(redactToken(err.message, token));
    }
    throw new Error('unknown error');
  }
}

export function shouldRunLiveSmoke(): boolean {
  return (
    process.env['SLACK_SMOKE'] === '1' &&
    Boolean(process.env['SLACK_TOKEN'])
  );
}
