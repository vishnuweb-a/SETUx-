#!/usr/bin/env node
/**
 * Verifies that a running SetuX backend answers its health endpoint.
 *
 * Usage: node scripts/health-check.mjs [baseUrl]
 * Default baseUrl: http://localhost:3000/api/v1
 */
const baseUrl = process.argv[2] ?? process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1';
const url = `${baseUrl.replace(/\/$/, '')}/health`;

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const body = await response.json();

  if (!response.ok || body?.success !== true) {
    console.error(`Health check FAILED (${response.status}):`, JSON.stringify(body));
    process.exit(1);
  }

  console.log(`Health check passed: ${body.data.service} is ${body.data.status} (${body.data.environment})`);
} catch (error) {
  console.error(`Health check FAILED — could not reach ${url}`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
