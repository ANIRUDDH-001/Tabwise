// Server-side id validation before rendering (T-P1-06).
export const UUID_RE=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const isUuid=id=>typeof id==='string'&&UUID_RE.test(id);
