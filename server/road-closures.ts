// TomTom Orbis Traffic Incident Details v2. One shared regional request, not GPS.
export const region = [-83.35, 42.15, -82.8, 42.55] as const;
type Coordinate = [number, number];
type Geometry = { type: 'Point'; coordinates: Coordinate } |
  { type: 'LineString'; coordinates: Coordinate[] };
export type Closure = {
  id: string; status: 'hazard'; geometry: Geometry;
  description: string; from: string; to: string; endTime: string | null;
};
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function coordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) &&
    Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}
export function normalizeClosures(data: unknown, now = Date.now()): Closure[] {
  const incidents = object(data).incidents;
  if (!Array.isArray(incidents)) throw new Error('Invalid incident feed');
  const result = new Map<string, Closure>();
  for (const item of incidents) {
    const row = object(item), p = object(row.properties), g = object(row.geometry);
    if (p.iconCategory !== 'roadClosed' || p.timeValidity !== 'present' || typeof p.id !== 'string') continue;
    if (typeof p.startTime === 'string' && Date.parse(p.startTime) > now) continue;
    if (typeof p.endTime === 'string' && Date.parse(p.endTime) <= now) continue;
    let geometry: Geometry;
    if (g.type === 'Point' && coordinate(g.coordinates)) {
      geometry = { type: 'Point', coordinates: g.coordinates };
    } else if (g.type === 'LineString' && Array.isArray(g.coordinates) &&
        g.coordinates.length >= 2 && g.coordinates.every(coordinate)) {
      geometry = { type: 'LineString', coordinates: g.coordinates };
    } else continue;
    const points = geometry.type === 'Point' ? [geometry.coordinates] : geometry.coordinates;
    // Keep intersecting geometry intact, including segments straddling the box.
    if (Math.max(...points.map(p => p[0])) < region[0] ||
        Math.min(...points.map(p => p[0])) > region[2] ||
        Math.max(...points.map(p => p[1])) < region[1] ||
        Math.min(...points.map(p => p[1])) > region[3]) continue;
    result.set(p.id, {
      id: p.id, status: 'hazard', geometry,
      description: Array.isArray(p.events)
        ? p.events.map(e => object(e).description).filter(d => typeof d === 'string').join('; ')
        : 'Road closed',
      from: typeof p.from === 'string' ? p.from : '',
      to: typeof p.to === 'string' ? p.to : '',
      endTime: typeof p.endTime === 'string' && Number.isFinite(Date.parse(p.endTime)) ? p.endTime : null,
    });
  }
  return [...result.values()];
}

export function createClosureFeed(fetcher: typeof fetch = fetch, now = Date.now) {
  let cached: { closures: Closure[]; fetchedAt: string; source: string } | undefined;
  let nextRequest = 0;
  let pending: Promise<NonNullable<typeof cached>> | undefined;
  return async (key: string) => {
    if (pending) return pending;
    if (now() < nextRequest) {
      if (cached) return cached;
      throw new Error('Feed temporarily unavailable');
    }
    pending = (async () => {
      try {
        const url = new URL('https://api.tomtom.com/maps/orbis/traffic/incidents/details');
        url.search = new URLSearchParams({ apiVersion: '2', bbox: region.join(','),
          iconCategories: 'roadClosed', timeValidity: 'present' }).toString();
        const response = await fetcher(url, {
          headers: { 'TomTom-Api-Key': key, 'TomTom-Api-Version': '2',
            Attributes: 'incidents(geometry(type,coordinates),properties(id,iconCategory,timeValidity,startTime,endTime,from,to,events(description)))',
            'Accept-Language': 'en-US' },
          signal: AbortSignal.timeout(10000), cache: 'no-store',
        });
        if (!response.ok) throw new Error('Closure provider unavailable');
        cached = { closures: normalizeClosures(await response.json(), now()),
          fetchedAt: new Date(now()).toISOString(), source: 'TomTom' };
        nextRequest = now() + 60000;
        return cached;
      } catch {
        cached = undefined;
        nextRequest = now() + 30000;
        throw new Error('Closure provider unavailable');
      } finally { pending = undefined; }
    })();
    return pending;
  };
}
