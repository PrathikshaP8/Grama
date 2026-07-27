/** Approximate coordinates for villages/towns used in recommendations. */
const GEO: Record<string, { lat: number; lng: number }> = {
  belman: { lat: 13.0827, lng: 74.9959 },
  mangalore: { lat: 12.9141, lng: 74.856 },
  hassan: { lat: 13.0033, lng: 76.1004 },
  mysore: { lat: 12.2958, lng: 76.6394 },
  udupi: { lat: 13.3409, lng: 74.7421 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
};

export function resolveRegisteredCoords(village?: string, city?: string): { lat: number; lng: number; source: string } {
  const v = village?.trim().toLowerCase();
  const c = city?.trim().toLowerCase();
  if (v && GEO[v]) return { ...GEO[v], source: `village:${village}` };
  if (c && GEO[c]) return { ...GEO[c], source: `city:${city}` };
  // Fallback near Mangalore rural belt
  return { lat: 13.05, lng: 74.95, source: 'fallback:rural' };
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
