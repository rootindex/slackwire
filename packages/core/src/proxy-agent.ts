import { HttpsProxyAgent } from 'https-proxy-agent';

export function createProxyAgent(proxyUrl: string): HttpsProxyAgent<string> {
  return new HttpsProxyAgent(proxyUrl);
}
