import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-ignore Direct TypeScript execution in Node.
import { POST as initialize } from '../app/api/initialize/route.ts';
// @ts-ignore Direct TypeScript execution in Node.
import { GET, POST } from '../app/api/instances/[instanceId]/route.ts';

test('instance remains trackable across heartbeats, expiry, and closure', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lifecycle-'));
  process.env.INSTANCE_DATA_DIR = directory;
  const instanceId = 'c3e6f8a0-7844-4e75-8c46-14df486098a2';
  const context = { params: Promise.resolve({ instanceId }) };
  const request = (action = 'heartbeat') => new Request(`http://localhost/api/instances/${instanceId}?action=${action}`, { method: 'POST' });
  try {
    assert.equal((await POST(request(), context)).status, 404);
    assert.equal((await GET(request(), { params: Promise.resolve({ instanceId: '../bad' }) })).status, 400);
    assert.equal((await initialize(new Request('http://localhost/api/initialize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceId, platform: 'web' }),
    }))).status, 200);
    const first = await (await GET(request(), context)).json();
    assert.equal(first.status, 'active');
    await writeFile(path.join(directory, `${instanceId}.seen`), new Date(Date.now() - 121000).toISOString());
    assert.equal((await (await GET(request(), context)).json()).status, 'expired');
    const resumed = await (await POST(request(), context)).json();
    assert.equal(resumed.status, 'active');
    assert.equal(resumed.initializedAt, first.initializedAt);
    assert.ok(Date.parse(resumed.lastSeenAt) >= Date.parse(first.lastSeenAt));
    assert.equal((await POST(request('bad'), context)).status, 400);
    // An overlapping heartbeat must never overwrite the close marker.
    await Promise.all([POST(request(), context), POST(request('close'), context)]);
    const closed = await (await GET(request(), context)).json();
    assert.equal(closed.status, 'closed');
    assert.ok(closed.closedAt);
    assert.equal((await POST(request(), context)).status, 409);
    assert.equal((await (await POST(request('close'), context)).json()).closedAt, closed.closedAt);
    const secondId = 'c3e6f8a0-7844-4e75-8c46-14df486098a3';
    await initialize(new Request('http://localhost/api/initialize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceId: secondId, platform: 'web' }),
    }));
    assert.equal((await (await GET(request(), { params: Promise.resolve({ instanceId: secondId }) })).json()).status, 'active');
  } finally {
    delete process.env.INSTANCE_DATA_DIR;
    await rm(directory, { recursive: true, force: true });
  }
});
