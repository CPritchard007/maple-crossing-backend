export function GET() {
  return Response.json({ service: "maple-crossing-backend", health: "/api/health" });
}
