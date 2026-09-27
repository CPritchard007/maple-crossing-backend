# Maple Crossing backend

Next.js API server with TypeScript and a production Docker image. Requires Docker with Compose.

## Run

```sh
docker compose up --build -d --wait
curl http://localhost:3000/api/health
```

The health endpoint returns `{"status":"ok"}`. `/` returns service information.
The port is bound to localhost. Set `PORT=3001` before the Compose command to use another host port.

```sh
docker compose logs -f backend
docker compose down
```

Re-run the build command after code changes. Add API endpoints as `app/api/<name>/route.ts`.

## Local development

With Node.js 22 and npm installed:

```sh
npm ci
npm run dev
```

Run `npm run typecheck` to check TypeScript. The Docker build also checks types.
The container uses Next.js standalone output and runs as a non-root user.
If public assets are added later, copy `public/` into the Docker runner stage as well.

## Anonymous initialization

`POST /api/initialize` accepts JSON with `instanceId` (lowercase UUID v4 generated per app launch) and `platform` (`web`, `android`, `iOS`, `macOS`, `windows`, `linux`, or `fuchsia`). Returns 200 with `{instanceId, platform, initializedAt}` on first registration and 200 with the original record on retries. No login or cookies are required. Invalid requests return 400/415, bodies over 1 KiB return 413, and storage failures return 503. CORS permits anonymous cross-origin POSTs and OPTIONS.

```sh
curl http://localhost:3000/api/initialize -H 'Content-Type: application/json' -d '{"instanceId":"c3e6f8a0-7844-4e75-8c46-14df486098a2","platform":"web"}'
```

Records are JSON files in `data/instances` (override with `INSTANCE_DATA_DIR`). Compose mounts a named volume to retain them across container rebuilds. `docker compose down -v` deletes that volume. This storage is intended for the current single-server deployment; replicas need shared storage or a database. No public listing endpoint is exposed. Individual instance status can be queried by ID; no cross-launch identity is collected. IDs are untrusted correlation identifiers, never authorization. Production ingress should limit anonymous request rates and storage retention.

Run route tests with `npm test`.

## Instance lifecycle

- `GET /api/instances/<instanceId>` returns the persisted launch record plus `status`, `lastSeenAt`, `closedAt`, `expiresAt`, and `heartbeatIntervalSeconds: 30`.
- `POST /api/instances/<instanceId>?action=heartbeat` updates last-seen time and returns HTTP 200.
- `POST /api/instances/<instanceId>?action=close` permanently closes the instance and returns HTTP 200. Repeated closes preserve the original close time. Bodies are not required, allowing browser `sendBeacon` on page exit.
- Invalid IDs/actions return 400, unknown instances return 404, and heartbeats on closed instances return 409.

Status is `active` until 120 seconds after the last heartbeat (or initialization), then `expired`; an explicit close produces `closed`. Expiration is computed on reads without a background job. An expired instance can resume with the same ID, but a closed one cannot. Records remain on disk for inspection after closure. Heartbeat and close sidecar files are published atomically; close takes precedence even if a heartbeat arrives concurrently. Existing launch records from before lifecycle tracking remain readable.

```sh
curl http://localhost:3000/api/instances/INSTANCE_ID
curl -X POST 'http://localhost:3000/api/instances/INSTANCE_ID?action=heartbeat'
curl -X POST 'http://localhost:3000/api/instances/INSTANCE_ID?action=close'
```

Close notifications are best-effort, so expiry means loss of contact rather than proof that the window closed. Background throttling or offline devices may expire and resume. Status and mutation endpoints use only the anonymous ID: they provide telemetry, not authenticated presence or access control.

## Amazon Polly speech

`POST /api/speech` accepts JSON `{ "text": "Welcome", "language": "en-CA" }` and returns `audio/mpeg`. Text must contain 1–3,000 Unicode characters; the body limit is 20 KB. Languages are `en-CA`/`en-US` (Joanna) and `fr-CA` (Gabrielle), using the Neural engine. English uses a US accent. AWS failures return a generic HTTP 503; invalid input returns 400/413/415. Requests time out after 15 seconds.

For local Next.js development, create an untracked `.env.local`:

```dotenv
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
# AWS_SESSION_TOKEN=your-session-token-if-using-temporary-credentials
```

The SDK also supports the standard AWS credential chain, including local profiles and IAM roles. Grant the backend `polly:SynthesizeSpeech` on resource `*`. Never put AWS credentials in Flutter, `--dart-define`, or `NEXT_PUBLIC_*` variables. Restart the backend after configuration changes.

For Docker Compose, put these variables in an untracked `.env` or export them before starting Compose; the service forwards them into the container. Host AWS profiles are not mounted. On AWS, prefer an attached IAM role over static keys.

The endpoint follows the existing anonymous API/CORS model; instance IDs are not authentication. Keep the backend private for personal use, or put authentication and rate limits at the gateway before exposing this billable endpoint publicly. There is no synthesis cache; repeated requests are billed again. No S3 bucket is required.

Voice support: https://docs.aws.amazon.com/polly/latest/dg/neural-voices.html
