import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-ignore Node executes the TypeScript source directly for route tests.
import { POST, OPTIONS } from '../app/api/initialize/route.ts';

test('anonymous initialization validates input and persists idempotently', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'instances-'));
  process.env.INSTANCE_DATA_DIR = directory;
  const send = (body: unknown) => POST(new Request('http://localhost/api/initialize', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  try {
    const input = { instanceId: 'c3e6f8a0-7844-4e75-8c46-14df486098a2', platform: 'web' };
    const first = await send(input);
    assert.equal(first.status, 200);
    const record = await first.json();
    assert.equal(record.instanceId, input.instanceId);
    assert.ok(Date.parse(record.initializedAt));
    const retry = await send(input);
    assert.equal(retry.status, 200);
    assert.deepEqual(await retry.json(), record);
    assert.equal((await readdir(directory)).length, 1);
    for (const invalid of [null, [], {}, { ...input, instanceId: '../../escape' }, { ...input, platform: 'unknown' }]) {
      assert.equal((await send(invalid)).status, 400);
    }
    assert.equal((await send({ padding: 'x'.repeat(1025) })).status, 413);
    const malformed = await POST(new Request('http://localhost/api/initialize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    }));
    assert.equal(malformed.status, 400);
    assert.equal((await POST(new Request('http://localhost', { method: 'POST', body: '{}' }))).status, 415);
    assert.equal(OPTIONS().status, 204);
    assert.equal(first.headers.get('Access-Control-Allow-Origin'), '*');
    process.env.INSTANCE_DATA_DIR = path.join(directory, `${input.instanceId}.json`, 'invalid');
    assert.equal((await send(input)).status, 503);
  } finally {
    delete process.env.INSTANCE_DATA_DIR;
    await rm(directory, { recursive: true, force: true });
  }
});
