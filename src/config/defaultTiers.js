// Default vehicle tiers, shaped as a bands[] array per tier.
// Each band has { maxMiles: number|null, base, perMile }.
// A band with maxMiles: null is the "open" final band (no upper bound).
// The lookup rule: find the first band whose maxMiles is null OR distanceMiles <= maxMiles.

const band = (maxMiles, base, perMile) => ({ maxMiles, base, perMile });

export const DEFAULT_VEHICLE_TIERS = {
  UBER_X: {
    label: "Taxi X",
    seats: 4,
    bags: 4,
    bagType: "carry_on",
    bands: [
      band(10, 15, 0.5),
      band(20, 12, 0.5),
      band(30, 12, 1.1),
      band(null, 0, 1.5),
    ],
  },
  UBER_COMFORT: {
    label: "Taxi Comfort",
    seats: 4,
    bags: 4,
    bagType: "large_bag",
    bands: [
      band(10, 15, 0.75),
      band(20, 12, 0.75),
      band(30, 12, 1.25),
      band(null, 0, 1.75),
    ],
  },
  UBER_XL: {
    label: "Taxi XL",
    seats: 6,
    bags: 6,
    bagType: "carry_on",
    bands: [
      band(10, 15, 0.9),
      band(20, 12, 0.9),
      band(30, 12, 1.55),
      band(null, 0, 2.0),
    ],
  },
  UBER_XXL: {
    label: "Taxi XXL",
    seats: 7,
    bags: 7,
    bagType: "carry_on",
    bands: [
      band(10, 15, 1.1),
      band(20, 12, 1.1),
      band(30, 12, 1.75),
      band(null, 0, 2.25),
    ],
  },
  BLACK_CAR: {
    label: "Black Car",
    seats: 4,
    bags: 4,
    bagType: "large_bag",
    bands: [
      band(10, 15, 1.75),
      band(20, 12, 3.0),
      band(30, 0, 3.0),
      band(null, 0, 3.0),
    ],
  },
};

export const TIER_ORDER = ["UBER_X", "UBER_COMFORT", "UBER_XL", "UBER_XXL", "BLACK_CAR"];

// Default namedPlaces (EWR seeded for v1). Admin can add more (JFK, LGA, etc.) later.
// NOTE: matchAddresses are stored as REGEX STRINGS (not RegExp objects) because
// PostgreSQL JSONB cannot serialize regex objects — they'd become `{}` in the DB.
export const DEFAULT_NAMED_PLACES = [
  {
    id: "EWR",
    label: "Newark Liberty International Airport",
    center: { lat: 40.6895, lng: -74.1745 },
    radiusKm: 1.5,
    matchAddresses: [
      "newark liberty int(ernational)? airport",
      "\\bEWR\\b",
      "newark airport",
    ],
    surchargeBands: [
      { minMiles: 0, maxMiles: 10, amount: 5 },
      { minMiles: 10, maxMiles: 20, amount: 8 },
      { minMiles: 20, maxMiles: 30, amount: 10 },
    ],
  },
];

// Default zones. All three currently use the same NJ→NJ band rates for v1;
// structure is in place to override per-zone rates later.
export const DEFAULT_ZONES = [
  { id: "NJ_NJ", label: "New Jersey → New Jersey", originState: "NJ", destinationState: "NJ", defaultTierRates: true },
  { id: "NJ_NY", label: "New Jersey → New York", originState: "NJ", destinationState: "NY", defaultTierRates: true },
  { id: "NJ_OTHER", label: "New Jersey → Other", originState: "NJ", destinationState: "*", defaultTierRates: true },
];

// Default crossing rules. Detection is longitude-based (mirrors tollDetector.js):
// origin.lng < -74.0 (NJ) and destination.lng > -74.0 (NY).
// When matched, the rule multiplies the listed fare components and the delta is
// surfaced as its own breakdown line so the customer sees why the price is higher.
export const DEFAULT_CROSSING_RULES = [
  {
    id: "NJ_TO_NY",
    label: "NJ → NY Crossing",
    multiplier: 2.0,
    appliesTo: ["base", "perMile"],
    active: true,
  },
];

// Default time-of-day surcharge windows.
// Each window is [startHour, endHour) in America/New_York. startHour is inclusive, endHour exclusive.
export const DEFAULT_TIME_OF_DAY_SURCHARGE = [
  { id: "night", label: "Early-morning / late-night surcharge", startHour: 0, endHour: 9, amount: 5 },
  { id: "peak", label: "Peak hours surcharge", startHour: 15, endHour: 19, amount: 8 },
];
