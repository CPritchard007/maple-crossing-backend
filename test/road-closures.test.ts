import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore Node runs TypeScript directly.
import { normalizeClosures, createClosureFeed } from '../server/road-closures.ts';
// @ts-ignore Node runs TypeScript directly.
import { GET, OPTIONS } from '../app/api/road-closures/route.ts';

const incident = (id: string, properties = {}, geometry = {
  type: 'LineString', coordinates: [[-83.05, 42.33], [-83.06, 42.34]],
}) => ({ geometry, properties: { id, iconCategory: 'roadClosed', timeValidity: 'present', ...properties } });

test('only current regional full closures become hazard geometry', () => {
  const rows = normalizeClosures({ incidents: [
    incident('detroit'), incident('detroit'),
    incident('windsor', {}, { type: 'Point', coordinates: [-82.95, 42.3] as unknown as number[][] }),
    incident('lanes', { iconCategory: 'laneClosed' }),
    incident('construction', { iconCategory: 'roadWorks' }),
    incident('future', { timeValidity: 'future' }),
    incident('not-started', { startTime: '2099-01-01T00:00:00Z' }),
    incident('expired', { endTime: '2000-01-01T00:00:00Z' }),
    incident('bad', {}, { type: 'LineString', coordinates: [[-83, 420], [-83, 42]] }),
    incident('away', {}, { type: 'LineString', coordinates: [[-79, 43], [-79.1, 43.1]] }),
  ] });
  assert.deepEqual(rows.map(r => r.id), ['detroit', 'windsor']);
  assert.ok(rows.every(r => r.status === 'hazard'));
  assert.deepEqual(rows[0].geometry.coordinates[0], [-83.05, 42.33]);
  assert.throws(() => normalizeClosures({ error: 'bad feed' }));
});

test('shared cache coalesces callers, refresh removes reopened roads, errors back off', async () => {
  let now = 1800000000000, calls = 0, fail = false;
  const feed = createClosureFeed((async (url: URL, init: RequestInit) => {
    calls++;
    assert.equal(url.searchParams.get('iconCategories'), 'roadClosed');
    assert.equal(url.searchParams.get('timeValidity'), 'present');
    assert.equal(url.searchParams.has('key'), false);
    assert.equal((init.headers as Record<string, string>)['TomTom-Api-Key'], 'test-key');
    if (fail) return new Response('', { status: 429 });
    return Response.json({ incidents: calls === 1 ? [incident('closed')] : [] });
  }) as unknown as typeof fetch, () => now);
  const [a, b] = await Promise.all([feed('test-key'), feed('test-key')]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  await feed('test-key');
  assert.equal(calls, 1);
  now += 61000;
  assert.equal((await feed('test-key')).closures.length, 0);
  now += 61000;
  fail = true;
  await assert.rejects(feed('test-key'));
  await assert.rejects(feed('test-key'));
  assert.equal(calls, 3);
});

test('missing key is explicitly unavailable and CORS is enabled', async () => {
  const previous = process.env.TOMTOM_API_KEY;
  delete process.env.TOMTOM_API_KEY;
  try {
    const response = await GET();
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'not_configured');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(OPTIONS().status, 204);
  } finally {
    if (previous !== undefined) process.env.TOMTOM_API_KEY = previous;
  }
});
