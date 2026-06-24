// Light validation for a pasted Google Maps location link.
// Accepts the common forms: maps.app.goo.gl, goo.gl/maps, google.com/maps,
// maps.google.com, g.co/kgs. Empty string is considered valid (optional field).
export function isValidMapsLink(value) {
  const v = (value || '').trim();
  if (!v) return true;
  if (!/^https?:\/\//i.test(v)) return false;
  return /(maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google\.|g\.co\/kgs|google\.[a-z.]+\/.*maps)/i.test(v);
}
