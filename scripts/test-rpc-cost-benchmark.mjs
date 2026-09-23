import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { parseArgs, runBenchmark } from './rpc-cost-benchmark.mjs';

const HASH = `0x${'a'.repeat(64)}`;
const ADDRESS = `0x${'1'.repeat(40)}`;
const TOPIC = `0x${'2'.repeat(64)}`;
const BLOCK = 69_785_500;
const TAG = `0x${BLOCK.toString(16)}`;

async function withRpc(handler, fn) {
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const request = JSON.parse(raw);
    handler(request, res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${server.address().port}/secret-path/api-key?token=hidden`;
  try { await fn(endpoint); } finally { server.close(); await once(server, 'close'); }
}

function responseFor(request) {
  if (request.method === 'eth_chainId') return '0x1237';
  if (request.method === 'eth_getBlockByNumber') return { number: TAG, hash: HASH };
  if (request.method === 'eth_call') return '0x1234';
  if (request.method === 'eth_getLogs') return [];
  throw new Error('unexpected method');
}

test('requires explicit endpoint and refuses malformed or oversized fixtures', () => {
  assert.throws(() => parseArgs([]), /explicit endpoint required/);
  assert.throws(() => parseArgs(['--endpoint', 'https://example.test', '--call-to', ADDRESS]), /valid reviewed/);
  assert.throws(() => parseArgs(['--endpoint', 'https://example.test', '--logs-address', ADDRESS, '--logs-topic', TOPIC, '--log-window', '101']), /between 1 and 100/);
  assert.throws(() => parseArgs(['--endpoint', 'https://example.test', '--call-to', ADDRESS, '--call-data', `0x${'a'.repeat(4100)}`]), /exceeds limit/);
  assert.throws(() => parseArgs(['--endpoint', 'http://example.com']), /HTTPS/);
  assert.throws(() => parseArgs(['--endpoint', 'ftp://localhost/rpc']), /HTTPS/);
});

test('sends only read methods, pins state and logs to the fixed block, and redacts endpoint details', async () => {
  await withRpc((request, res) => {
    assert.ok(['eth_chainId', 'eth_getBlockByNumber', 'eth_call', 'eth_getLogs'].includes(request.method));
    if (request.method === 'eth_getBlockByNumber') assert.deepEqual(request.params, [TAG, false]);
    if (request.method === 'eth_call') assert.deepEqual(request.params, [{ to: ADDRESS, data: '0x1234' }, TAG]);
    if (request.method === 'eth_getLogs') assert.deepEqual(request.params, [{ address: ADDRESS, topics: [TOPIC], fromBlock: `0x${(BLOCK - 4).toString(16)}`, toBlock: TAG }]);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: responseFor(request) }));
  }, async endpoint => {
    const options = parseArgs(['--endpoint', endpoint, '--call-to', ADDRESS, '--call-data', '0x1234', '--logs-address', ADDRESS, '--logs-topic', TOPIC, '--log-window', '5']);
    const summary = await runBenchmark(options);
    assert.equal(summary.failures, 0);
    assert.equal(summary.attempts, 4);
    assert.equal(summary.batchMembers, 4);
    assert.equal(summary.retries, 0);
    assert.deepEqual(Object.keys(summary.methods), ['eth_chainId', 'eth_getBlockByNumber', 'eth_call', 'eth_getLogs']);
    assert.equal(Object.hasOwn(summary, 'endpoint'), false);
    assert.doesNotMatch(JSON.stringify(summary), /secret-path|api-key|hidden|127\.0\.0\.1/);
  });
});

test('fails closed on wrong chain ID before block and optional fixture methods', async () => {
  await withRpc((request, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: request.method === 'eth_chainId' ? '0x1' : responseFor(request) }));
  }, async endpoint => {
    const options = parseArgs(['--endpoint', endpoint, '--call-to', ADDRESS, '--call-data', '0x1234', '--logs-address', ADDRESS, '--logs-topic', TOPIC]);
    const summary = await runBenchmark(options);
    assert.equal(summary.failures, 1);
    assert.deepEqual(Object.keys(summary.methods), ['eth_chainId']);
  });
});

test('fails closed on a mismatched JSON-RPC response ID', async () => {
  await withRpc((request, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 'different-request', result: '0x1237' }));
  }, async endpoint => {
    const options = parseArgs(['--endpoint', endpoint, '--call-to', ADDRESS, '--call-data', '0x1234']);
    const summary = await runBenchmark(options);
    assert.equal(summary.failures, 1);
    assert.deepEqual(Object.keys(summary.methods), ['eth_chainId']);
  });
});

test('fails closed on an invalid fixed block before optional fixture methods', async () => {
  await withRpc((request, res) => {
    const result = request.method === 'eth_chainId' ? '0x1237' : { number: TAG, hash: '0x1234' };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
  }, async endpoint => {
    const options = parseArgs(['--endpoint', endpoint, '--logs-address', ADDRESS, '--logs-topic', TOPIC]);
    const summary = await runBenchmark(options);
    assert.equal(summary.failures, 1);
    assert.deepEqual(Object.keys(summary.methods), ['eth_chainId', 'eth_getBlockByNumber']);
  });
});

test('records partial RPC failures and continues remaining bounded methods', async () => {
  await withRpc((request, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, ...(request.method === 'eth_getBlockByNumber' ? { error: { code: -32000, message: 'private provider detail' } } : { result: responseFor(request) }) }));
  }, async endpoint => {
    const summary = await runBenchmark(parseArgs(['--endpoint', endpoint]));
    assert.equal(summary.attempts, 2);
    assert.equal(summary.failures, 1);
    assert.equal(summary.methods.eth_getBlockByNumber.failures, 1);
    assert.doesNotMatch(JSON.stringify(summary), /private provider detail|hidden|api-key/);
  });
});

test('rejects oversized provider responses without exposing payload content', async () => {
  await withRpc((_request, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': '70000' });
    res.end('x'.repeat(70000));
  }, async endpoint => {
    const summary = await runBenchmark(parseArgs(['--endpoint', endpoint]));
    assert.equal(summary.failures, 1);
    assert.deepEqual(Object.keys(summary.methods), ['eth_chainId']);
    assert.equal(summary.responseBytes, 0);
  });
});
