import type { Agent, RequestOptions } from 'node:http';
import { createConnection, type Socket } from 'node:net';
import * as https from 'node:https';
import type { Duplex } from 'node:stream';

class TunnelAgent extends https.Agent {
  private readonly proxyHost: string;
  private readonly proxyPort: number;

  constructor(proxyUrl: string) {
    super();
    const parsed = new URL(proxyUrl);
    this.proxyHost = parsed.hostname;
    this.proxyPort = Number(parsed.port) || 3128;
  }

  override createConnection(
    options: RequestOptions,
    callback: ((err: Error | null, stream: Duplex) => void) | undefined,
  ): Duplex | null | undefined {
    const host = options.host ?? options.hostname ?? '';
    const port = options.port ?? 443;
    const target = `${host}:${port}`;
    const socket: Socket = createConnection(this.proxyPort, this.proxyHost, () => {
      socket.write(
        `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\nProxy-Connection: keep-alive\r\n\r\n`,
      );
      socket.once('data', () => {
        if (callback) callback(null, socket);
      });
    });
    socket.on('error', (err) => {
      if (callback) callback(err, socket);
    });
    return socket;
  }
}

export function createProxyAgent(proxyUrl: string): Agent {
  return new TunnelAgent(proxyUrl) as unknown as Agent;
}
