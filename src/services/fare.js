import { computeFareBreakdown } from "./fareRules.js";

const round2 = (n) => Number(Number(n).toFixed(2));

export function computeFare(input) {
  const r = computeFareBreakdown({ ...input, tollAmount: input.tollAmount ?? 0 });
  return {
    base: r.base,
    perMileTotal: r.perMileTotal,
    perMinuteTotal: 0,
    ewrSurcharge: r.ewrSurcharge,
    timeOfDaySurcharge: r.timeOfDaySurcharge,
    tollAmount: r.tollAmount,
    crossingSurcharge: r.crossingSurcharge,
    crossingRuleId: r.crossingRuleId,
    total: r.total,
    currency: r.currency,
    breakdown: r.breakdown,
    bandRate: r.bandRate,
    zoneId: r.zoneId,
    namedPlaceId: r.namedPlaceId,
    timeOfDayWindowId: r.timeOfDayWindowId,
  };
}
