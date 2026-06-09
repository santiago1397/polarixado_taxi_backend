export const DEFAULT_VEHICLE_TIERS = {
  UBER_X: {
    label: "Uber X",
    seats: 4,
    bags: 4,
    bagType: "carry_on",
    baseFare: 15,
    perMile: 1.5,
    perMinute: 0.2,
  },
  UBER_COMFORT: {
    label: "Uber Comfort",
    seats: 4,
    bags: 4,
    bagType: "large_bag",
    baseFare: 15,
    perMile: 2.0,
    perMinute: 0.27,
  },
  UBER_XL: {
    label: "Uber XL",
    seats: 6,
    bags: 6,
    bagType: "carry_on",
    baseFare: 15,
    perMile: 2.45,
    perMinute: 0.33,
  },
  UBER_XXL: {
    label: "Uber XXL",
    seats: 7,
    bags: 7,
    bagType: "carry_on",
    baseFare: 15,
    perMile: 3.0,
    perMinute: 0.4,
  },
};

export const TIER_ORDER = ["UBER_X", "UBER_COMFORT", "UBER_XL", "UBER_XXL"];
