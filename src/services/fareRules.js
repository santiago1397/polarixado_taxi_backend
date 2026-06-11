// Pure fare-computation rules. No I/O, no DB. Inputs are config blobs (as returned
// by getConfig() / as stored in the Config row) and trip facts. Output is a flat
// breakdown object plus a breakdown[] array for UI rendering.

const STATE_RE = /(?:^|,\s*)([A-Z]{2})(?:\s+\d{5})?(?:,|$|\s)/;
const FAR_FUTURE_MS = 8.64e15;

// ----- band lookup -----

// Find the first band whose maxMiles is null (open band) OR distanceMiles <= maxMiles.
// Bands must be ordered by maxMiles ascending; the last band should have maxMiles: null.
export function findBand(tier, distanceMiles) {
  if (!tier?.bands?.length) throw new Error(`tier has no bands: ${tier?.label || "?"}`);
  for (const b of tier.bands) {
    if (b.maxMiles === null || b.maxMiles === undefined) return b;
    if (distanceMiles <= b.maxMiles) return b;
  }
  return tier.bands[tier.bands.length - 1];
}

// ----- zone lookup -----

export function extractState(address) {
  if (!address || typeof address !== "string") return null;
  const m = address.match(STATE_RE);
  return m ? m[1] : null;
}

export function findZone(origin, destination, zones) {
  if (!Array.isArray(zones) || zones.length === 0) return null;
  const oState = extractState(origin?.address);
  const dState = extractState(destination?.address);
  const exact = zones.find((z) => z.originState === oState && z.destinationState === dState);
  if (exact) return exact;
  const wildcard = zones.find((z) => z.originState === oState && z.destinationState === "*");
  if (wildcard) return wildcard;
  return zones[zones.length - 1] || null;
}

// Returns the band array to use for (tier, zone). For v1 every zone uses the tier's
// own bands (defaultTierRates: true). Override later by populating zone.bandOverrides[tierKey].
export function bandsFor(tier, zone) {
  if (!zone) return tier.bands;
  const override = zone.bandOverrides?.[tier.key || tier.id];
  if (Array.isArray(override) && override.length) return override;
  return tier.bands;
}

// ----- named-place detection (EWR for v1, extensible to JFK/LGA) -----

// Haversine distance in km between two {lat, lng} points.
function haversineKm(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return Infinity;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Compile a namedPlace's address patterns into RegExp objects (idempotent).
function compiledPatterns(place) {
  if (place._compiled) return place._compiled;
  const sources = Array.isArray(place.matchAddresses) ? place.matchAddresses : [];
  place._compiled = sources.map((s) => (s instanceof RegExp ? s : new RegExp(String(s), "i")));
  return place._compiled;
}

export function isInNamedPlace(point, place) {
  if (!point || !place) return false;
  if (place.center && place.radiusKm != null) {
    if (haversineKm(point, place.center) <= place.radiusKm) return true;
  }
  if (point.address) {
    const patterns = compiledPatterns(place);
    if (patterns.some((re) => re.test(point.address))) return true;
  }
  return false;
}

export function findMatchingNamedPlace(point, namedPlaces) {
  if (!Array.isArray(namedPlaces)) return null;
  return namedPlaces.find((p) => isInNamedPlace(point, p)) || null;
}

// Surcharge for dropping off at a named place, given total trip distance.
// Returns { amount, placeId, placeLabel } or null if no surcharge applies.
export function getNamedPlaceSurcharge(point, namedPlaces, distanceMiles) {
  const place = findMatchingNamedPlace(point, namedPlaces);
  if (!place || !Array.isArray(place.surchargeBands) || place.surchargeBands.length === 0) {
    return null;
  }
  // Bands are { minMiles, maxMiles, amount } — find the one that contains distanceMiles.
  // If distanceMiles exceeds the highest band, fall through to the highest band (cap).
  let chosen = null;
  for (const b of place.surchargeBands) {
    const lo = b.minMiles ?? 0;
    const hi = b.maxMiles ?? Infinity;
    if (distanceMiles > lo && distanceMiles <= hi) { chosen = b; break; }
  }
  if (!chosen) {
    const sorted = [...place.surchargeBands].sort((a, b) => (a.maxMiles ?? 0) - (b.maxMiles ?? 0));
    chosen = sorted[sorted.length - 1] || null;
  }
  if (!chosen) return null;
  return { amount: Number(chosen.amount), placeId: place.id, placeLabel: place.label };
}

// ----- time-of-day surcharge -----

// Format a Date as the hour (0–23) in America/New_York.
function hourInEastern(at) {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) return null;
  return Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }).format(at)
  );
}

// Returns { amount, windowId, label } or null. Windows are [startHour, endHour).
export function getTimeOfDaySurcharge(at, windows) {
  if (!Array.isArray(windows) || windows.length === 0) return null;
  const hour = hourInEastern(at);
  if (hour == null) return null;
  const w = windows.find((win) => hour >= win.startHour && hour < win.endHour);
  if (!w) return null;
  return { amount: Number(w.amount) || 0, windowId: w.id, label: w.label };
}

// ----- main entry point -----

// Inputs:
//   - vehicleTiers: object keyed by tier id (UBER_X, BLACK_CAR, ...)
//   - vehicleType: tier id
//   - distanceMiles, etaMin: trip facts
//   - origin, destination: { address, lat, lng } | null
//   - mode: "ASAP" | "SCHEDULED"
//   - scheduledAt: ISO string or Date or null
//   - createdAt: ISO string or Date (used for ASAP pickup time)
//   - zones, namedPlaces, timeOfDaySurcharge: config blobs
//   - isDeal: when true, skip EWR and time-of-day surcharges (informational only)
export function computeFareBreakdown(input) {
  const {
    vehicleTiers, vehicleType,
    distanceMiles, etaMin,
    origin, destination,
    mode, scheduledAt, createdAt,
    zones, namedPlaces, timeOfDaySurcharge,
    isDeal = false,
    currency = "USD",
    tollAmount = 0,
  } = input;

  const tier = vehicleTiers?.[vehicleType];
  if (!tier) throw new Error(`unknown vehicle type: ${vehicleType}`);

  const dist = Math.max(0, Number(distanceMiles) || 0);
  const eta = Math.max(0, Number(etaMin) || 0);

  // Pick the band from the zone's effective rate table (defaults to tier.bands for v1).
  const zone = findZone(origin, destination, zones);
  const effectiveBands = bandsFor(tier, zone);
  const band = findBand({ ...tier, bands: effectiveBands }, dist);

  const base = Number(band.base) || 0;
  const perMileTotal = Number((dist * (Number(band.perMile) || 0)).toFixed(2));

  let ewrSurcharge = 0;
  let ewrLabel = null;
  if (!isDeal) {
    const ewr = getNamedPlaceSurcharge(destination, namedPlaces, dist);
    if (ewr) {
      ewrSurcharge = Number(ewr.amount);
      ewrLabel = "Newark Airport Surcharge";
    }
  }

  let todSurcharge = 0;
  let todLabel = null;
  if (!isDeal) {
    const pickupTime = mode === "SCHEDULED" && scheduledAt ? new Date(scheduledAt) : new Date(createdAt || Date.now());
    if (pickupTime.getTime() < FAR_FUTURE_MS) {
      const tod = getTimeOfDaySurcharge(pickupTime, timeOfDaySurcharge);
      if (tod) {
        todSurcharge = Number(tod.amount);
        todLabel = tod.label || "Time-of-day surcharge";
      }
    }
  }

  const toll = (!isDeal && Number.isFinite(tollAmount) && tollAmount > 0)
    ? Number(tollAmount.toFixed(2))
    : 0;

  const total = Number((base + perMileTotal + ewrSurcharge + todSurcharge + toll).toFixed(2));

  const breakdown = [
    { label: "Base", value: base },
    { label: `Distance (${dist.toFixed(2)} mi × $${Number(band.perMile).toFixed(2)}/mi)`, value: perMileTotal },
  ];
  if (ewrSurcharge > 0 && ewrLabel) breakdown.push({ label: ewrLabel, value: ewrSurcharge });
  if (todSurcharge > 0 && todLabel) breakdown.push({ label: todLabel, value: todSurcharge });
  if (toll > 0) breakdown.push({ label: "Tolls", value: toll });
  breakdown.push({ label: "Total", value: total, total: true });

  return {
    base,
    perMileTotal,
    ewrSurcharge,
    timeOfDaySurcharge: todSurcharge,
    tollAmount: toll,
    total,
    currency,
    bandRate: Number(band.perMile) || 0,
    bandBase: base,
    zoneId: zone?.id || null,
    namedPlaceId: ewrLabel ? namedPlaces?.find((p) => isInNamedPlace(destination, p))?.id || null : null,
    timeOfDayWindowId: todLabel ? (timeOfDaySurcharge?.find((w) => w.label === todLabel)?.id || null) : null,
    breakdown,
  };
}
