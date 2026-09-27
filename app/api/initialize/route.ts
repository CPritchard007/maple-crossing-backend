import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const platforms = new Set(["web", "android", "iOS", "macOS", "windows", "linux", "fuchsia"]);

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}

export async function POST(request: Request) {
  const reply = (body: unknown, status: number) => Response.json(body, { status, headers });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return reply({ error: "Expected application/json" }, 415);
  }
  let input: unknown;
  try {
    // Bound actual bytes, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Missing body" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        return reply({ error: "Body too large" }, 413);
      }
      chunks.push(value);
    }
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return reply({ error: "Invalid JSON" }, 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return reply({ error: "Expected an object" }, 400);
  }
  const { instanceId, platform } = input as Record<string, unknown>;
  if (typeof instanceId !== "string" || !uuid.test(instanceId) ||
      typeof platform !== "string" || !platforms.has(platform)) {
    return reply({ error: "Expected a UUID v4 instanceId and supported platform" }, 400);
  }
  try {
    const directory = process.env.INSTANCE_DATA_DIR || path.join(process.cwd(), "data", "instances");
    await mkdir(directory, { recursive: true });
    const filename = path.join(directory, `${instanceId}.json`);
    const record = { instanceId, platform, initializedAt: new Date().toISOString() };
    try {
      // Exclusive creation makes retries idempotent, including across workers.
      await writeFile(filename, JSON.stringify(record) + "\n", { flag: "wx", mode: 0o600 });
      return reply(record, 200);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return reply(JSON.parse(await readFile(filename, "utf8")), 200);
    }
  } catch (error) {
    console.error("App instance registration failed", error);
    return reply({ error: "Registration unavailable" }, 503);
  }
}
