import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};
const client = new PollyClient({ region: process.env.AWS_REGION || "us-east-1" });

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}

export async function POST(request: Request) {
  const reply = (error: string, status: number) => Response.json({ error }, { status, headers });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return reply("Expected application/json", 415);
  }
  let input: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply("Missing body", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 20000) {
        await reader.cancel();
        return reply("Body too large", 413);
      }
      chunks.push(value);
    }
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return reply("Invalid JSON", 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return reply("Expected an object", 400);
  }
  const { text, language = "en-CA" } = input as Record<string, unknown>;
  if (typeof text !== "string" || !text.trim() || Array.from(text).length > 3000) {
    return reply("Expected 1–3000 characters of text", 400);
  }
  // Polly has no en-CA voice. Use Joanna for English and Gabrielle for Canadian French.
  if (language !== "en-CA" && language !== "en-US" && language !== "fr-CA") {
    return reply("Supported languages: en-CA, en-US, fr-CA", 400);
  }
  try {
    const result = await client.send(new SynthesizeSpeechCommand({
      Text: text.trim(),
      TextType: "text",
      OutputFormat: "mp3",
      Engine: "neural",
      VoiceId: language === "fr-CA" ? "Gabrielle" : "Joanna",
    }), { abortSignal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]) });
    const audio = await result.AudioStream?.transformToByteArray();
    if (!audio?.length) throw new Error("Empty audio");
    return new Response(Buffer.from(audio), {
      headers: { ...headers, "Content-Type": "audio/mpeg" },
    });
  } catch (error) {
    // Do not return SDK errors or credentials to the browser.
    console.error("Polly synthesis failed", error instanceof Error ? error.name : "UnknownError");
    return reply("Speech synthesis unavailable", 503);
  }
}
