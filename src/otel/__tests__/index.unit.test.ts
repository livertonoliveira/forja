/**
 * Unit tests for src/otel/index.ts — MOB-1089.
 *
 * Tests:
 *  - readOTelConfig() returns enabled: false when FORJA_OTEL_ENABLED is not set
 *  - readOTelConfig() returns enabled: true when FORJA_OTEL_ENABLED=true
 *  - readOTelConfig() returns custom endpoint from FORJA_OTEL_ENDPOINT
 *  - readOTelConfig() returns default endpoint 'http://localhost:4317' when env var not set
 *  - readOTelConfig() returns protocol: 'grpc' (default) when FORJA_OTEL_PROTOCOL not set
 *  - readOTelConfig() returns protocol: 'http' when FORJA_OTEL_PROTOCOL=http
 *  - initOTel({ enabled: false }) returns undefined without throwing
 *  - shutdownOTel() after initOTel({ enabled: false }) resolves without error
 *  - shutdownOTel() without prior initOTel resolves without throwing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readOTelConfig, initOTel, shutdownOTel } from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearOTelEnvVars(): void {
  delete process.env.FORJA_OTEL_ENABLED;
  delete process.env.FORJA_OTEL_ENDPOINT;
  delete process.env.FORJA_OTEL_PROTOCOL;
}

// ---------------------------------------------------------------------------
// readOTelConfig — env var parsing
// ---------------------------------------------------------------------------

describe('readOTelConfig — FORJA_OTEL_ENABLED', () => {
  beforeEach(() => {
    clearOTelEnvVars();
  });

  afterEach(() => {
    clearOTelEnvVars();
  });

  it('returns enabled: false when FORJA_OTEL_ENABLED is not set', () => {
    const config = readOTelConfig();
    expect(config.enabled).toBe(false);
  });

  it('returns enabled: true when FORJA_OTEL_ENABLED=true', () => {
    process.env.FORJA_OTEL_ENABLED = 'true';
    const config = readOTelConfig();
    expect(config.enabled).toBe(true);
  });

  it('returns enabled: false when FORJA_OTEL_ENABLED=false', () => {
    process.env.FORJA_OTEL_ENABLED = 'false';
    const config = readOTelConfig();
    expect(config.enabled).toBe(false);
  });
});

describe('readOTelConfig — FORJA_OTEL_ENDPOINT', () => {
  beforeEach(() => {
    clearOTelEnvVars();
  });

  afterEach(() => {
    clearOTelEnvVars();
  });

  it('returns default endpoint http://localhost:4317 when env var not set', () => {
    const config = readOTelConfig();
    expect(config.endpoint).toBe('http://localhost:4317');
  });

  it('returns custom endpoint from FORJA_OTEL_ENDPOINT', () => {
    process.env.FORJA_OTEL_ENDPOINT = 'http://collector.example.com:4317';
    const config = readOTelConfig();
    expect(config.endpoint).toBe('http://collector.example.com:4317');
  });
});

describe('readOTelConfig — FORJA_OTEL_PROTOCOL', () => {
  beforeEach(() => {
    clearOTelEnvVars();
  });

  afterEach(() => {
    clearOTelEnvVars();
  });

  it('returns protocol: grpc (default) when FORJA_OTEL_PROTOCOL is not set', () => {
    const config = readOTelConfig();
    expect(config.protocol).toBe('grpc');
  });

  it('returns protocol: http when FORJA_OTEL_PROTOCOL=http', () => {
    process.env.FORJA_OTEL_PROTOCOL = 'http';
    const config = readOTelConfig();
    expect(config.protocol).toBe('http');
  });
});

// ---------------------------------------------------------------------------
// initOTel — disabled path
// ---------------------------------------------------------------------------

describe('initOTel — disabled path', () => {
  it('returns undefined without throwing when enabled: false', () => {
    const result = initOTel({ enabled: false, endpoint: 'http://x', protocol: 'grpc' });
    expect(result).toBeUndefined();
  });

  it('does not throw when called multiple times with enabled: false', () => {
    expect(() => {
      initOTel({ enabled: false, endpoint: 'http://x', protocol: 'grpc' });
      initOTel({ enabled: false, endpoint: 'http://x', protocol: 'grpc' });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// shutdownOTel — no SDK initialized
// ---------------------------------------------------------------------------

describe('shutdownOTel — no active SDK', () => {
  it('resolves without throwing when no SDK is active', async () => {
    await expect(shutdownOTel()).resolves.toBeUndefined();
  });

  it('resolves without throwing after initOTel({ enabled: false })', async () => {
    initOTel({ enabled: false, endpoint: 'http://x', protocol: 'grpc' });
    await expect(shutdownOTel()).resolves.toBeUndefined();
  });
});
