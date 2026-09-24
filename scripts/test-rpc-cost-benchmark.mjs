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
const LOG = {
  address: ADDRESS,
  blockNumber: TAG,
  blockHash: HASH,
  transactionHash: `0x${'b'.repeat(64)}`,
  transactionIndex: '0x1',
  logIndex: '0x2',
  topics: [TOPIC, `0x${'3'.repeat(64)}`],
  data: '0x0102',
};

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

function responseFor(request, logs = []) {
  if (request.method === 'eth_chainId') return '0x1237';
  if (request.method === 'eth_getBlockByNumber') return { number: TAG, hash: HASH };
  if (request.method === 'eth_call') return '0x1234';
  if (request.method === 'eth_getLogs') return logs;
  throw new Error('unexpected method');
}

test('requires explicit endpoint and refuses malformed or oversized fixtures', () => {
  assert.throws(() => parseArgs([]), /explicit endpoint required/);
  assert.throws(() => parseArgs(['--endpoint', 'https://example.test', '--call-to', ADDRESS]), /valid reviewed/);
  assert.throws(() => parseArgs(['--endpoint', 'https://example.test', '--logs-address', ADDRESS, '--logs-topic', TOPIC, '--log-window', '101']), /between 1 and 100/);
  assert.throws(() => parseArgs(['--endpoint', 'https://example.test', '--call-to', ADDRESS, '--call-data', `0x${'a'.repeat(4100)}`]), /exceeds limit/);
  assert.throws(() => parseArgs(['--endpoint', 'http://example.com']), /HTTPS/);
  assert.throws(() => parseArgs(['--endpoint', 'ftp://localhost/rpc']), /HTTPS/);
  assert.throws(() => parseArgs(['--endpoint', 'https://example.test', '--expect-log-digest', 'bad']), /invalid expected log digest/);
  assert.throws(() => parseArgs(['--endpoint', 'https://example.test', '--expect-log-digest', 'a'.repeat(64)]), /requires a logs fixture/);
  assert.throws(() => parseArgs(['--endpoint', 'https://example.test', '--expect-block-hash', '0x1234']), /invalid expected block hash/);
});

test('loads only the named endpoint variable and requires a credential-free HTTPS URL', () => {
  assert.throws(() => parseArgs(['--endpoint-env', 'PROSPECTIVE_RPC'], {}), /explicit endpoint required/);
  const endpoint = 'https://rpc.example.test/path?api-key=fake-secret';
  assert.equal(parseArgs(['--endpoint-env', 'PROSPECTIVE_RPC'], { PROSPECTIVE_RPC: endpoint }).endpoint, endpoint);
  for (const invalid of [
    'http://rpc.example.test/path?api-key=fake-secret',
    'https://user:fake-secret@rpc.example.test/rpc',
    'https://rpc.example.test/rpc#fake-secret',
  ]) {
    assert.throws(() => parseArgs(['--endpoint-env', 'PROSPECTIVE_RPC'], { PROSPECTIVE_RPC: invalid }));
  }
  assert.equal(parseArgs(['--endpoint-env', 'PROSPECTIVE_RPC'], { PROSPECTIVE_RPC: endpoint, OTHER: 'https://ignored.test' }).endpoint, endpoint);
});

test('invalid endpoint configuration makes no RPC request', async () => {
  let requests = 0;
  assert.throws(() => {
    const options = parseArgs(['--endpoint-env', 'PROSPECTIVE_RPC'], { PROSPECTIVE_RPC: 'https://user:fake-secret@rpc.example.test' });
    return runBenchmark(options, async () => { requests += 1; });
  });
  assert.equal(requests, 0);
});

test('RPC failures never expose the endpoint URL or its embedded key', async () => {
  const endpoint = 'https://rpc.example.test/path?api-key=fake-secret';
  const options = parseArgs(['--endpoint', endpoint]);
  const summary = await runBenchmark(options, async () => { throw new Error(`request failed for ${endpoint}`); });
  const output = JSON.stringify(summary);
  assert.equal(summary.failures, 1);
  assert.doesNotMatch(output, /rpc\.example\.test|fake-secret|api-key/);
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

test('normalizes Swap logs independent of order, case, and quantity leading zeros', async () => {
  const first = { ...LOG, topics: [...LOG.topics] };
  const second = { ...LOG, logIndex: '0x3', transactionHash: `0x${'c'.repeat(64)}` };
  const runLogs = async logs => {
    let summary;
    await withRpc((request, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      const result = request.method === 'eth_getLogs' ? logs : responseFor(request);
      res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
    }, async endpoint => { summary = await runBenchmark(parseArgs(['--endpoint', endpoint, '--logs-address', ADDRESS, '--logs-topic', TOPIC, '--log-window', '1'])); });
    return summary;
  };
  const one = await runLogs([first, second]);
  const two = await runLogs([
    { ...second, address: `0x${ADDRESS.slice(2).toUpperCase()}`, blockNumber: `0x0${BLOCK.toString(16)}`, transactionIndex: '0x01', logIndex: '0x03', blockHash: `0x${HASH.slice(2).toUpperCase()}`, transactionHash: `0x${second.transactionHash.slice(2).toUpperCase()}`, topics: second.topics.map(value => `0x${value.slice(2).toUpperCase()}`), data: '0x0102' },
    { ...first, blockNumber: `0x0${BLOCK.toString(16)}`, transactionIndex: '0x01', logIndex: '0x02', blockHash: `0x${HASH.slice(2).toUpperCase()}`, transactionHash: `0x${first.transactionHash.slice(2).toUpperCase()}`, topics: first.topics.map(value => `0x${value.slice(2).toUpperCase()}`), data: '0x0102' },
  ]);
  assert.equal(one.failures, 0);
  assert.equal(two.failures, 0);
  assert.equal(one.conformance.swapLogCount, 2);
  assert.equal(one.conformance.swapLogDigest, two.conformance.swapLogDigest);
  assert.equal(one.conformance.fixedBlockHash, HASH);
});

test('expected conformance values fail on a mismatch without exposing fixture values', async () => {
  await withRpc((request, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: responseFor(request, [LOG]) }));
  }, async endpoint => {
    const summary = await runBenchmark(parseArgs(['--endpoint', endpoint, '--logs-address', ADDRESS, '--logs-topic', TOPIC, '--expect-log-digest', '0'.repeat(64)]));
    assert.equal(summary.failures, 1);
    assert.equal(summary.conformance.fixedBlockHash, HASH);
    assert.equal(summary.conformance.swapLogCount, 1);
    assert.notEqual(summary.conformance.swapLogDigest, '0'.repeat(64));
    assert.doesNotMatch(JSON.stringify(summary), /secret-path|api-key|hidden|127\.0\.0\.1|0x1111|0x2222/);
  });
});

test('stops before optional reads when the expected fixed block hash differs', async () => {
  const methods = [];
  await withRpc((request, res) => {
    methods.push(request.method);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: responseFor(request, [LOG]) }));
  }, async endpoint => {
    const summary = await runBenchmark(parseArgs(['--endpoint', endpoint, '--expect-block-hash', `0x${'f'.repeat(64)}`, '--call-to', ADDRESS, '--call-data', '0x1234', '--logs-address', ADDRESS, '--logs-topic', TOPIC]));
    assert.equal(summary.failures, 1);
    assert.deepEqual(methods, ['eth_chainId', 'eth_getBlockByNumber']);
  });
});

test('rejects malformed, wrong-address, wrong-topic, out-of-range, removed, and duplicate logs', async t => {
  const cases = [
    ['malformed', { ...LOG, logIndex: 'invalid' }],
    ['wrong address', { ...LOG, address: `0x${'4'.repeat(40)}` }],
    ['wrong topic', { ...LOG, topics: [`0x${'5'.repeat(64)}`] }],
    ['out of range', { ...LOG, blockNumber: `0x${(BLOCK + 1).toString(16)}` }],
    ['removed', { ...LOG, removed: true }],
  ];
  for (const [name, log] of cases) await t.test(name, async () => {
    await withRpc((request, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: responseFor(request, [log]) }));
    }, async endpoint => {
      const summary = await runBenchmark(parseArgs(['--endpoint', endpoint, '--logs-address', ADDRESS, '--logs-topic', TOPIC]));
      assert.equal(summary.failures, 1);
      assert.equal(summary.conformance.swapLogCount, null);
      assert.equal(summary.conformance.swapLogDigest, null);
    });
  });
  await t.test('duplicate', async () => {
    await withRpc((request, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: responseFor(request, [LOG, { ...LOG, address: ADDRESS.toUpperCase() }]) }));
    }, async endpoint => {
      const summary = await runBenchmark(parseArgs(['--endpoint', endpoint, '--logs-address', ADDRESS, '--logs-topic', TOPIC]));
      assert.equal(summary.failures, 1);
      assert.equal(summary.conformance.swapLogCount, null);
    });
  });
});

test('rejects distinct rows colliding on canonical position or event ID in either response order', async t => {
  const otherHash = `0x${'d'.repeat(64)}`;
  const collisions = [
    ['canonical position', [LOG, { ...LOG, transactionHash: `0x${'c'.repeat(64)}` }]],
    ['event ID across block hashes', [LOG, { ...LOG, blockHash: otherHash, blockNumber: `0x${(BLOCK - 1).toString(16)}`, transactionIndex: '0x0' }]],
  ];
  for (const [name, rows] of collisions) await t.test(name, async () => {
    for (const logs of [rows, [...rows].reverse()]) {
      await withRpc((request, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: responseFor(request, logs) }));
      }, async endpoint => {
        const summary = await runBenchmark(parseArgs(['--endpoint', endpoint, '--logs-address', ADDRESS, '--logs-topic', TOPIC, '--log-window', '2']));
        assert.equal(summary.failures, 1);
        assert.equal(summary.conformance.swapLogCount, null);
        assert.equal(summary.conformance.swapLogDigest, null);
      });
    }
  });
});
