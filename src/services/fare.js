export function computeFare(distanceMiles, etaMin, vehicleTiers, vehicleType, currency = "USD") {
  const tier = vehicleTiers?.[vehicleType];
  if (!tier) throw new Error(`unknown vehicle type: ${vehicleType}`);

  const base = Number(tier.baseFare);
  const perMileTotal = Number((Number(distanceMiles) * Number(tier.perMile)).toFixed(2));
  const perMinuteTotal = Number((Number(etaMin || 0) * Number(tier.perMinute)).toFixed(2));
  const total = Number((base + perMileTotal + perMinuteTotal).toFixed(2));

  return { base, perMileTotal, perMinuteTotal, total, currency };
}
