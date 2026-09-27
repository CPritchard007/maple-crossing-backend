import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
// @ts-ignore Node executes the TypeScript source directly for route tests.
import { POST, OPTIONS } from '../app/api/speech/route.ts';

const send = (body: unknown) => POST(new Request('http://localhost/api/speech', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));

test('speech validates input, selects neural voices, returns audio, and masks AWS errors', async () => {
  const calls: SynthesizeSpeechCommand[] = [];
  const mocked = mock.method(PollyClient.prototype, 'send', async (command: SynthesizeSpeechCommand) => {
    calls.push(command);
    return { AudioStream: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } };
  });
  try {
    for (const body of [null, [], {}, { text: '' }, { text: 'x'.repeat(3001) }, { text: 'Hi', language: 'bad' }]) {
      assert.equal((await send(body)).status, 400);
    }
    assert.equal((await send({ text: 'x'.repeat(20001) })).status, 413);
    assert.equal((await POST(new Request('http://localhost', { method: 'POST', body: '{}' }))).status, 415);
    assert.equal((await POST(new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }))).status, 400);
    assert.equal(calls.length, 0);
    const response = await send({ text: ' Hello ' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
    assert.equal(calls[0].input.VoiceId, 'Joanna');
    assert.equal(calls[0].input.Engine, 'neural');
    assert.equal(calls[0].input.TextType, 'text');
    assert.equal(calls[0].input.Text, 'Hello');
    assert.equal((await send({ text: 'Bonjour', language: 'fr-CA' })).status, 200);
    assert.equal(calls[1].input.VoiceId, 'Gabrielle');
    mocked.mock.mockImplementation(async () => { throw new Error('private AWS details'); });
    const failure = await send({ text: 'Hello' });
    assert.equal(failure.status, 503);
    assert.deepEqual(await failure.json(), { error: 'Speech synthesis unavailable' });
    assert.equal(OPTIONS().status, 204);
  } finally {
    mock.restoreAll();
  }
});
