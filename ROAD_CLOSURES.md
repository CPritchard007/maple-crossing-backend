# Windsor / Detroit road closures

## Provider choice

Use **TomTom Orbis Traffic API, Incident Details v2**. It supports a single bounding-box query across the border, current full-road closure filtering, and GeoJSON road geometry. Canada and the United States are listed in its incident coverage. Coverage is not a guarantee that every municipal closure has been reported.

- [Incident Details documentation](https://docs.tomtom.com/traffic-api/documentation/tomtom-orbis-maps/v2/traffic-incidents/incident-details)
- [Market coverage](https://docs.tomtom.com/traffic-api/documentation/tomtom-orbis-maps/v2/product-information/market-coverage)
- [Get an API key](https://docs.tomtom.com/platform/documentation/my-tomtom/how-to-get-a-tomtom-api-key)

Alternatives investigated: [Ontario 511](https://511on.ca/developers/doc) requires a developer key and covers Ontario, so it needs a separate Michigan integration. [MDOT ITS data](https://www.michigan.gov/mdot/travel/safety/efforts/its/its-data) provides Michigan data access. [Windsor construction notices](https://www.citywindsor.ca/residents/construction) and Municipal511 are useful supplementary sources for local streets; this implementation does not scrape them.

## Enable

Create a TomTom developer key with access to Orbis Traffic Incident Details v2. Review the account's current quota, pricing and usage terms. Set the key in the backend's ignored `.env` file:

```dotenv
TOMTOM_API_KEY=your_key_here
```

Restart the development backend, or rebuild/recreate Compose with `docker compose up -d --build`. Compose passes this variable to the container. No key belongs in Flutter, a `NEXT_PUBLIC_` variable, source control, or AI action text.

Verify `GET /api/road-closures`: HTTP 200 contains `closures`, `fetchedAt` and `source`. HTTP 503 with `code: not_configured` means no key; `unavailable` means a provider/network failure. An empty successful list means no closures were reported, not that every road is confirmed open. Frontend uses its existing `BACKEND_URL` configuration.

## Query and display behavior

- Fixed regional box: west −83.35, south 42.15, east −82.80, north 42.55. This includes Windsor, Detroit and their immediate approaches, not all of Essex County or metro Detroit. No user's GPS is sent to TomTom.
- Request `iconCategories=roadClosed` and `timeValidity=present`. Exclude lane-only closures, general construction, future and expired records. Preserve longitude/latitude coordinate order.
- Normalize each record to `status: hazard`. Keep provider geometry, description, from/to and end time; deduplicate by provider ID. Invalid geometry is discarded. Point-only reports remain points; never fabricate a line connecting locations.
- Cache successful responses for 60 seconds per backend process and share concurrent requests. Failed requests back off for 30 seconds. No permanent incident archive is kept. A single continuously used backend process makes at most approximately 1,440 successful refresh requests/day; multiple processes have separate caches.
- Flutter loads at startup and polls every minute. Current closures are enabled by default: red neon tubes for roads, red markers for point reports. They do not move the camera, speak, or replace narration highlights, and survive the return-to-user action.
- Each successful refresh replaces the list, removing reopened roads. On feed failure, remove old highlights and show unavailable in the menu. Data older than two minutes is not rendered; expired end times are also removed. Missing coverage is never displayed as a confirmed open road.
- The map credits TomTom and the menu reports the feed status/count. The bundled demo road is no longer automatically painted as a hazard; explicit demo roads and action highlights still work.

Tests use synthetic provider fixtures. Real regional results and account access still need verification after provisioning the key.
