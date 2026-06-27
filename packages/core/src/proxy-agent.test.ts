import { describe, it, expect } from 'vitest';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createProxyAgent } from './proxy-agent.js';

describe('createProxyAgent', () => {
  it('returns an HttpsProxyAgent that tunnels via CONNECT and upgrades to TLS', () => {
    const agent = createProxyAgent('http://proxy.internal:3128');
    expect(agent).toBeInstanceOf(HttpsProxyAgent);
  });

  it('carries the proxy host and port from the url', () => {
    const agent = createProxyAgent('http://proxy.internal:3128');
    expect(agent.proxy.hostname).toBe('proxy.internal');
    expect(agent.proxy.port).toBe('3128');
  });

  it('preserves proxy auth credentials from the url userinfo', () => {
    const agent = createProxyAgent('http://user:pass@proxy.internal:3128');
    expect(agent.proxy.username).toBe('user');
    expect(agent.proxy.password).toBe('pass');
  });
});
