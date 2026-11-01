import { describe, it, expect } from 'vitest';
import { createProxyServer } from './proxy.mjs';

describe('KT-026: validación de KEV_UPSTREAM_URL al arrancar', () => {
  it('rechaza esquema file:// con error claro', () => {
    expect(() => createProxyServer({ kevUpstreamUrl: 'file:///tmp' })).toThrow(
      /http:\/\/ o https:\/\//
    );
  });

  it('rechaza esquema ftp:// con error claro', () => {
    expect(() => createProxyServer({ kevUpstreamUrl: 'ftp://example.com' })).toThrow(
      /http:\/\/ o https:\/\//
    );
  });

  it('acepta http:// y https://', () => {
    expect(() => createProxyServer({ kevUpstreamUrl: 'http://example.com' })).not.toThrow();
    expect(() => createProxyServer({ kevUpstreamUrl: 'https://example.com' })).not.toThrow();
  });
});
