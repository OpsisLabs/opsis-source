#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';

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
const DIGEST_RE = /^[0-9a-fA-F]{64}$/;
const QUANTITY_RE = /^0x[0-9a-fA-F]+$/;

function normalizeQuantity(value) {
  if (typeof value !== 'string' || !QUANTITY_RE.test(value)) return null;
  return `0x${BigInt(value).toString(16)}`;
}

function normalizeSwapLogs(logs, address, topic, fromBlock, toBlock) {
  if (!Array.isArray(logs)) return null;
  const expectedAddress = address.toLowerCase();
  const expectedTopic = topic.toLowerCase();
  const rows = [];
  const seenPositions = new Set();
  const seenEvents = new Set();
  for (const log of logs) {
    if (!log || typeof log !== 'object' || Array.isArray(log) || (log.removed !== undefined && log.removed !== false)) return null;
    const blockNumber = normalizeQuantity(log.blockNumber);
    const transactionIndex = normalizeQuantity(log.transactionIndex);
    const logIndex = normalizeQuantity(log.logIndex);
    if (!ADDRESS_RE.test(log.address ?? '') || log.address.toLowerCase() !== expectedAddress) return null;
    if (!HASH_RE.test(log.blockHash ?? '') || !HASH_RE.test(log.transactionHash ?? '')) return null;
    if (!blockNumber || !transactionIndex || !logIndex || !DATA_RE.test(log.data ?? '')) return null;
    const block = Number(BigInt(blockNumber));
    if (!Number.isSafeInteger(block) || block < fromBlock || block > toBlock) return null;
    if (!Array.isArray(log.topics) || log.topics.length === 0 || log.topics.some(value => !HASH_RE.test(value ?? '')) || log.topics[0].toLowerCase() !== expectedTopic) return null;
    const normalized = {
      address: expectedAddress,
      blockNumber,
      blockHash: log.blockHash.toLowerCase(),
      transactionHash: log.transactionHash.toLowerCase(),
      transactionIndex,
      logIndex,
      topics: log.topics.map(value => value.toLowerCase()),
      data: log.data.toLowerCase(),
    };
    const position = `${normalized.blockNumber}:${normalized.transactionIndex}:${normalized.logIndex}`;
    const event = `${normalized.transactionHash}:${normalized.logIndex}`;
    if (seenPositions.has(position) || seenEvents.has(event)) return null;
    seenPositions.add(position);
    seenEvents.add(event);
    rows.push(normalized);
  }
  rows.sort((a, b) => BigInt(a.blockNumber) < BigInt(b.blockNumber) ? -1
    : BigInt(a.blockNumber) > BigInt(b.blockNumber) ? 1
      : BigInt(a.transactionIndex) < BigInt(b.transactionIndex) ? -1
        : BigInt(a.transactionIndex) > BigInt(b.transactionIndex) ? 1
          : BigInt(a.logIndex) < BigInt(b.logIndex) ? -1
            : BigInt(a.logIndex) > BigInt(b.logIndex) ? 1 : 0);
  const digest = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  return { count: rows.length, digest };
}

export function parseArgs(argv, env = process.env) {
  const values = {};
  const allowed = ['--endpoint', '--endpoint-env', '--drpc-key-env', '--call-to', '--call-data', '--logs-address', '--logs-topic', '--log-window', '--expect-block-hash', '--expect-log-digest'];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!allowed.includes(arg)) {
      throw new Error('unknown argument');
    }
    if (values[arg]) throw new Error('duplicate argument');
    values[arg] = argv[++i];
    if (!values[arg] || values[arg].startsWith('--')) throw new Error('missing argument value');
  }
  if (values['--endpoint'] && values['--endpoint-env']) throw new Error('choose one endpoint source');
  const envName = values['--endpoint-env'];
  if (envName && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName)) throw new Error('invalid endpoint environment variable name');
  const drpcKeyEnvName = values['--drpc-key-env'];
  if (drpcKeyEnvName && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(drpcKeyEnvName)) throw new Error('invalid dRPC key environment variable name');
  const drpcKey = drpcKeyEnvName ? env[drpcKeyEnvName] : undefined;
  if (drpcKeyEnvName && !drpcKey) throw new Error('explicit dRPC key environment variable required');
  const endpoint = values['--endpoint'] ?? (envName ? env[envName] : env.RPC_BENCHMARK_ENDPOINT);
  if (!endpoint) throw new Error('explicit endpoint required');
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('invalid endpoint'); }
  if (url.username || url.password || endpoint.includes('#')) throw new Error('endpoint must not contain credentials or a fragment');
  if (drpcKeyEnvName && (url.protocol !== 'https:' || url.hostname !== 'lb.drpc.live' || url.port)) {
    throw new Error('dRPC key environment variable requires an HTTPS lb.drpc.live endpoint');
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('endpoint must use HTTPS (HTTP is allowed only for localhost tests)');
  }
  if (envName && url.protocol !== 'https:') throw new Error('environment endpoint must use HTTPS');
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
  const expectedBlockHash = values['--expect-block-hash'];
  if (expectedBlockHash !== undefined && !HASH_RE.test(expectedBlockHash)) throw new Error('invalid expected block hash');
  const expectedLogDigest = values['--expect-log-digest'];
  if (expectedLogDigest !== undefined && !DIGEST_RE.test(expectedLogDigest)) throw new Error('invalid expected log digest');
  if (expectedLogDigest !== undefined && !hasLogs) throw new Error('expected log digest requires a logs fixture');
  return { endpoint: url.toString(), drpcKey, hasCall, callTo: values['--call-to'], callData: values['--call-data'], hasLogs, logsAddress: values['--logs-address'], logsTopic: values['--logs-topic'], logWindow, expectedBlockHash: expectedBlockHash?.toLowerCase(), expectedLogDigest: expectedLogDigest?.toLowerCase() };
}

export function usageText() {
  return 'Usage: node scripts/rpc-cost-benchmark.mjs (--endpoint-env ENDPOINT_ENV | --endpoint URL) [--drpc-key-env DRPC_KEY_ENV] [reviewed read-only fixtures]\nPass environment variable names, never credential values, as arguments.\n';
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
  const summary = { schema: 'opsis.rpc-cost-benchmark.v1', chainId: CHAIN_ID, fixedBlock: BLOCK_NUMBER, requestLimit: MAX_REQUESTS, responseByteLimitPerRequest: MAX_RESPONSE_BYTES, attempts: 0, batchMembers: 0, retries: 0, responseBytes: 0, latencyMs: 0, failures: 0, methods: {}, conformance: { fixedBlockHash: null, swapLogCount: null, swapLogDigest: null } };
  let conformanceMismatch = false;
  async function request(method, params, validate = () => true) {
    const entry = summary.methods[method] ??= { attempts: 0, failures: 0, responseBytes: 0, latencyMs: 0 };
    summary.attempts += 1;
    summary.batchMembers += 1;
    entry.attempts += 1;
    const started = performance.now();
    try {
      if (summary.attempts > MAX_REQUESTS) throw new Error('request limit exceeded');
      const id = randomUUID();
      const headers = { 'content-type': 'application/json' };
      if (options.drpcKey) headers['Drpc-Key'] = options.drpcKey;
      const response = await fetchImpl(options.endpoint, { method: 'POST', redirect: 'error', headers, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: AbortSignal.timeout(TIMEOUT_MS) });
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
  await request('eth_getBlockByNumber', [BLOCK_TAG, false], result => {
    const valid = Boolean(result && result.number?.toLowerCase() === BLOCK_TAG && HASH_RE.test(result.hash ?? ''));
    if (valid) {
      summary.conformance.fixedBlockHash = result.hash.toLowerCase();
      if (options.expectedBlockHash && summary.conformance.fixedBlockHash !== options.expectedBlockHash) conformanceMismatch = true;
    }
    return valid;
  });
  if (summary.failures || conformanceMismatch) {
    if (conformanceMismatch) summary.failures += 1;
    return summary;
  }
  if (options.hasCall) await request('eth_call', [{ to: options.callTo, data: options.callData }, BLOCK_TAG], result => typeof result === 'string' && DATA_RE.test(result));
  if (options.hasLogs) {
    const from = BLOCK_NUMBER - options.logWindow + 1;
    await request('eth_getLogs', [{ address: options.logsAddress, topics: [options.logsTopic], fromBlock: `0x${from.toString(16)}`, toBlock: BLOCK_TAG }], result => {
      const normalized = normalizeSwapLogs(result, options.logsAddress, options.logsTopic, from, BLOCK_NUMBER);
      if (!normalized) return false;
      summary.conformance.swapLogCount = normalized.count;
      summary.conformance.swapLogDigest = normalized.digest;
      if (options.expectedLogDigest && normalized.digest !== options.expectedLogDigest) conformanceMismatch = true;
      return true;
    });
  }
  if (conformanceMismatch) summary.failures += 1;
  return summary;
}

async function main() {
  try {
    const argv = process.argv.slice(2);
    if (argv.length === 1 && argv[0] === '--help') {
      process.stdout.write(usageText());
      return;
    }
    const options = parseArgs(argv);
    const result = await runBenchmark(options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.failures ? 1 : 0;
  } catch (error) {
    // Error messages can originate in URL parsing or fetch implementations. Never
    // serialize them: endpoint URLs may contain provider credentials.
    process.stderr.write(`${JSON.stringify({ schema: 'opsis.rpc-cost-benchmark.v1', error: 'benchmark configuration failed' })}\n`);
    process.exitCode = 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
