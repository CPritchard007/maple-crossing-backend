import { readFile, writeFile, rename, link, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const leaseMs = 120_000;
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Context = { params: Promise<{ instanceId: string }> };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });

export function OPTIONS() { return new Response(null, { status: 204, headers }); }

async function optionalFile(filename: string): Promise<string | null> {
  try { return await readFile(filename, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

// Publish complete files atomically. Separate close markers ensure a racing
// heartbeat cannot reopen a closed instance, even across server workers.
async function publish(filename: string, value: string, once = false) {
  const temp = `${filename}.${randomUUID()}.tmp`;
  await writeFile(temp, value, { mode: 0o600 });
  try {
    if (once) {
      try { await link(temp, filename); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    } else {
      await rename(temp, filename);
    }
  } finally {
    await unlink(temp).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

async function handle(request: Request, context: Context, update: boolean) {
  const { instanceId } = await context.params;
  if (!uuid.test(instanceId)) return reply({ error: 'Invalid instance ID' }, 400);
  const action = new URL(request.url).searchParams.get('action') ?? 'heartbeat';
  if (update && action !== 'heartbeat' && action !== 'close') {
    return reply({ error: 'Expected heartbeat or close action' }, 400);
  }
  const directory = process.env.INSTANCE_DATA_DIR || path.join(process.cwd(), 'data', 'instances');
  // Runtime volume data must not be bundled into the server image.
  const base = path.join(/* turbopackIgnore: true */ directory, instanceId);
  try {
    const source = await optionalFile(`${base}.json`);
    if (source === null) return reply({ error: 'Instance not found' }, 404);
    const record = JSON.parse(source);
    let closedAt = await optionalFile(`${base}.closed`);
    if (update) {
      if (action === 'close') {
        await publish(`${base}.closed`, new Date().toISOString(), true);
      } else {
        if (closedAt) return reply({ error: 'Instance is closed' }, 409);
        await publish(`${base}.seen`, new Date().toISOString());
      }
      closedAt = await optionalFile(`${base}.closed`);
    }
    const lastSeenAt = await optionalFile(`${base}.seen`) ?? record.initializedAt;
    const expiresAt = new Date(Date.parse(lastSeenAt) + leaseMs).toISOString();
    return reply({ ...record, lastSeenAt, closedAt, expiresAt,
      status: closedAt ? 'closed' : Date.now() >= Date.parse(expiresAt) ? 'expired' : 'active',
      heartbeatIntervalSeconds: 30,
    });
  } catch (error) {
    console.error('Instance lifecycle failed', error);
    return reply({ error: 'Instance tracking unavailable' }, 503);
  }
}

export function GET(request: Request, context: Context) { return handle(request, context, false); }
export function POST(request: Request, context: Context) { return handle(request, context, true); }
