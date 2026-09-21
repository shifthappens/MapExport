// Offline contract for the Node cache warmer's public-Overpass etiquette.
// Importing the tool must not start it; this only exercises its exported
// retry-policy primitives.
import {
  OVERPASS_UA, PrefetchAttemptError, cooldownForFailure,
} from '../tools/prefetch-validation-cache.mjs';

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`ok  ${name}`);
  else { console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); failures++; }
}

check('warm cache requests identify USE-IT MapExport with a contact URL and email',
  OVERPASS_UA === 'USE-IT-MapExport/1.0 (https://coen.at/mapexport; hello@coen.at)', OVERPASS_UA);

const ordinary = cooldownForFailure(new PrefetchAttemptError('http', 'HTTP 500'));
const timeout = cooldownForFailure(new PrefetchAttemptError('timeout', 'timeout'));
const unreachable = cooldownForFailure(new PrefetchAttemptError('unreachable', 'connection reset'));
check('timeouts wait longer than ordinary HTTP failures', timeout > ordinary, `${timeout}ms vs ${ordinary}ms`);
check('unreachable hosts wait longer than ordinary HTTP failures', unreachable > ordinary, `${unreachable}ms vs ${ordinary}ms`);
check('timeout and unreachable hosts use the same long pause', timeout === unreachable, `${timeout}ms vs ${unreachable}ms`);

if (failures) process.exit(1);
console.log('prefetch-cache-policy: all checks passed');
