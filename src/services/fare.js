export function computeFare(distanceKm, { baseFare, perKm, currency }) {
  const base = Number(baseFare);
  const perKmTotal = Number((distanceKm * Number(perKm)).toFixed(2));
  const total = Number((base + perKmTotal).toFixed(2));
  return { base, perKmTotal, total, currency };
}
