import http from 'node:http';

export interface ProxyServerConfig {
  port?: number;
  kevUpstreamUrl?: string;
  kevApiKey?: string;
  allowedOrigin?: string;
  maxBodyBytes?: number;
  upstreamTimeoutMs?: number;
}

export interface ProxyServer extends http.Server {
  port?: number;
}

export function createProxyServer(config?: ProxyServerConfig): ProxyServer;
