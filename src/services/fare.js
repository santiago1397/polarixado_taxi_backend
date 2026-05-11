export function computeFare(distanceKm, { baseFare, perKm, baseFareXl, perKmXl, currency }, vehicleType = "uber_x") {
  const isXl = vehicleType === "uber_xl";
  const bf = isXl ? (baseFareXl || baseFare * 1.6) : Number(baseFare);
  const pk = isXl ? (perKmXl || perKm * 1.5) : Number(perKm);
  const cur = currency || "USD";

  const base = Number(bf);
  const perKmTotal = Number((distanceKm * pk).toFixed(2));
  const total = Number((base + perKmTotal).toFixed(2));
  return { base, perKmTotal, total, currency: cur };
}
