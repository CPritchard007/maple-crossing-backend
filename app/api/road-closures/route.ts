// @ts-ignore Node route tests execute TypeScript directly.
import { createClosureFeed } from '../../../server/road-closures.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const feed = createClosureFeed();
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store',
};
export function OPTIONS() { return new Response(null, { status: 204, headers }); }
export async function GET() {
  const key = process.env.TOMTOM_API_KEY?.trim();
  if (!key) return Response.json({ error: 'Road closure feed is not configured', code: 'not_configured' }, { status: 503, headers });
  try {
    return Response.json(await feed(key), { headers });
  } catch {
    return Response.json({ error: 'Road closures temporarily unavailable', code: 'unavailable' }, { status: 503, headers });
  }
}
