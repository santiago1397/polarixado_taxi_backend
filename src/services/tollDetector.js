// Geofencing-based toll detection. No external API — uses anchor points and
// Haversine proximity checks against the trip's Mapbox route GeoJSON.

function haversineKm(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return Infinity;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Returns total toll amount in USD for a given route.
// routeGeoJSON: Mapbox Feature with LineString geometry (stored on each trip).
// origin/destination: { lat, lng } — used for direction-aware tolls.
// tollRoads: array from Config.tollRoads (see DEFAULT_TOLL_ROADS below).
export function detectTolls(routeGeoJSON, origin, destination, tollRoads) {
  if (!Array.isArray(tollRoads) || !tollRoads.length) return 0;

  const coords = routeGeoJSON?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return 0;

  // Mapbox coordinates are [lng, lat] pairs — convert to { lat, lng } objects.
  const points = coords.map(([lng, lat]) => ({ lat, lng }));

  let total = 0;

  for (const road of tollRoads) {
    // Direction-aware: only charge if trip originates in NJ (west of the Hudson).
    // The Hudson River boundary at the tunnel/bridge crossings is ~lng -74.0.
    if (road.directionAware && (origin?.lng ?? 0) >= -74.0) continue;

    const radius = road.radiusKm ?? 0.5;

    // Hit if any route point falls within radiusKm of any anchor point.
    const hit = road.anchors.some((anchor) =>
      points.some((pt) => haversineKm(pt, anchor) <= radius)
    );

    if (hit) total += Number(road.flatFee) || 0;
  }

  return Number(total.toFixed(2));
}

// Seeded into Config.tollRoads on first run. Admin can edit via config update.
export const DEFAULT_TOLL_ROADS = [
  {
    id: "lincoln_tunnel",
    label: "Lincoln Tunnel",
    flatFee: 16.79,
    directionAware: true,
    radiusKm: 0.3,
    anchors: [{ lat: 40.7593, lng: -74.0206 }],
  },
  {
    id: "holland_tunnel",
    label: "Holland Tunnel",
    flatFee: 16.79,
    directionAware: true,
    radiusKm: 0.3,
    anchors: [{ lat: 40.7267, lng: -74.0237 }],
  },
  {
    id: "gwb",
    label: "George Washington Bridge",
    flatFee: 16.79,
    directionAware: true,
    radiusKm: 0.4,
    anchors: [{ lat: 40.8506, lng: -73.9693 }],
  },
  {
    id: "nj_turnpike",
    label: "NJ Turnpike",
    flatFee: 6.0,
    directionAware: false,
    radiusKm: 0.8,
    anchors: [
      { lat: 40.815, lng: -74.135 },
      { lat: 40.692, lng: -74.174 },
      { lat: 40.57, lng: -74.309 },
    ],
  },
  {
    id: "gs_parkway",
    label: "Garden State Parkway",
    flatFee: 2.3,
    directionAware: false,
    radiusKm: 0.8,
    anchors: [
      { lat: 40.96, lng: -74.073 },
      { lat: 40.679, lng: -74.297 },
      { lat: 40.349, lng: -74.12 },
    ],
  },
];
