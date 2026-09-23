#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

const CHAIN_ID = 4663;
const BLOCK_NUMBER = 69_785_500;
const BLOCK_TAG = `0x${BLOCK_NUMBER.toString(16)}`;
const MAX_REQUESTS = 4;
const MAX_RESPONSE_BYTES = 64 * 1024;
const TIMEOUT_MS = 3_000;
const MAX_LOG_WINDOW = 100;
const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DATA_RE = /^0x(?:[0-9a-fA-F]{2})*$/;

export function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!['--endpoint', '--call-to', '--call-data', '--logs-address', '--logs-topic', '--log-window'].includes(arg)) {
      throw new Error('unknown argument');
    }
    if (values[arg]) throw new Error('duplicate argument');
    values[arg] = argv[++i];
    if (!values[arg] || values[arg].startsWith('--')) throw new Error('missing argument value');
  }
  const endpoint = values['--endpoint'] ?? process.env.RPC_BENCHMARK_ENDPOINT;
  if (!endpoint) throw new Error('explicit endpoint required');
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('invalid endpoint'); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('endpoint must use HTTPS (HTTP is allowed only for localhost tests)');
  }
  const hasCall = values['--call-to'] !== undefined || values['--call-data'] !== undefined;
  if (hasCall && (!ADDRESS_RE.test(values['--call-to'] ?? '') || !DATA_RE.test(values['--call-data'] ?? ''))) {
    throw new Error('eth_call requires a valid reviewed --call-to and --call-data fixture');
  }
  const hasLogs = values['--logs-address'] !== undefined || values['--logs-topic'] !== undefined || values['--log-window'] !== undefined;
  if (hasLogs && (!ADDRESS_RE.test(values['--logs-address'] ?? '') || !HASH_RE.test(values['--logs-topic'] ?? ''))) {
    throw new Error('eth_getLogs requires a valid reviewed --logs-address and --logs-topic fixture');
  }
  const logWindow = hasLogs ? Number(values['--log-window'] ?? '10') : 0;
  if (hasLogs && (!Number.isInteger(logWindow) || logWindow < 1 || logWindow > MAX_LOG_WINDOW)) {
    throw new Error(`log window must be between 1 and ${MAX_LOG_WINDOW} blocks`);
  }
  if (hasCall && values['--call-data'].length > 4098) throw new Error('eth_call calldata exceeds limit');
  return { endpoint: url.toString(), hasCall, callTo: values['--call-to'], callData: values['--call-data'], hasLogs, logsAddress: values['--logs-address'], logsTopic: values['--logs-topic'], logWindow };
}

async function readBounded(response) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error('response too large');
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('response too large'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function runBenchmark(options, fetchImpl = fetch) {
  const summary = { schema: 'opsis.rpc-cost-benchmark.v1', chainId: CHAIN_ID, fixedBlock: BLOCK_NUMBER, requestLimit: MAX_REQUESTS, responseByteLimitPerRequest: MAX_RESPONSE_BYTES, attempts: 0, batchMembers: 0, retries: 0, responseBytes: 0, latencyMs: 0, failures: 0, methods: {} };
  async function request(method, params, validate = () => true) {
    const entry = summary.methods[method] ??= { attempts: 0, failures: 0, responseBytes: 0, latencyMs: 0 };
    summary.attempts += 1;
    summary.batchMembers += 1;
    entry.attempts += 1;
    const started = performance.now();
    try {
      if (summary.attempts > MAX_REQUESTS) throw new Error('request limit exceeded');
      const id = randomUUID();
      const response = await fetchImpl(options.endpoint, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: AbortSignal.timeout(TIMEOUT_MS) });
      const body = await readBounded(response);
      summary.responseBytes += Buffer.byteLength(body);
      entry.responseBytes += Buffer.byteLength(body);
      if (!response.ok) throw new Error('http failure');
      const parsed = JSON.parse(body);
      if (parsed.id !== id || parsed.error || !Object.hasOwn(parsed, 'result') || !validate(parsed.result)) throw new Error('invalid rpc result');
    } catch {
      summary.failures += 1;
      entry.failures += 1;
    } finally {
      const elapsed = Math.round(performance.now() - started);
      summary.latencyMs += elapsed;
      entry.latencyMs += elapsed;
    }
  }

  await request('eth_chainId', [], result => result === '0x1237');
  if (summary.failures) return summary;
  await request('eth_getBlockByNumber', [BLOCK_TAG, false], result => Boolean(result && result.number?.toLowerCase() === BLOCK_TAG && HASH_RE.test(result.hash ?? '')));
  if (summary.failures) return summary;
  if (options.hasCall) await request('eth_call', [{ to: options.callTo, data: options.callData }, BLOCK_TAG], result => typeof result === 'string' && DATA_RE.test(result));
  if (options.hasLogs) {
    const from = BLOCK_NUMBER - options.logWindow + 1;
    await request('eth_getLogs', [{ address: options.logsAddress, topics: [options.logsTopic], fromBlock: `0x${from.toString(16)}`, toBlock: BLOCK_TAG }], result => Array.isArray(result));
  }
  return summary;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await runBenchmark(options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.failures ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ schema: 'opsis.rpc-cost-benchmark.v1', error: error.message })}\n`);
    process.exitCode = 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
