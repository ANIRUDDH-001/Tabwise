// Spend so far against the broker cap. Run from the repo root: npm run spend
import { openProjectBroker } from '../src/budget/broker.mjs';

try { process.loadEnvFile('.env'); } catch { /* no .env: defaults apply */ }

const b = openProjectBroker();
const s = b.status();
b.close();
const usd = (n) => `$${n.toFixed(2)}`;
console.log(`spent      ${usd(s.spentUsd)}`);
console.log(`reserved   ${usd(s.reservedUsd)} (${s.openReservations} open)`);
console.log(`cap        ${usd(s.capUsd)} (broker hard stop; credit ceiling $150, D25)`);
console.log(`headroom   ${usd(s.capUsd - s.spentUsd - s.reservedUsd)}`);
if (s.openReservations) console.log('open reservations are calls that failed or crashed: check Meta billing before releasing them');
