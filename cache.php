<?php
$CACHE_DIR = __DIR__ . '/cache/';
$CACHE_TTL = 7 * 24 * 3600; // 7 days

// Pinned entries (cache/pinned/) never expire and are never swept: the seven
// engine-v2 validation areas must stay exportable offline forever, and refresh
// only when a human asks for it (tools/pin-cache.sh). Before this, the pinned
// snapshot was inert — a README told you to `cp` it back by hand — so every
// validation export silently went back to Overpass once the 7-day TTL lapsed.
// A pinned entry is served whenever the live copy is missing or expired; a
// fresher live copy still wins. tools/pin-cache.sh drops the .disabled marker
// so an explicit refresh can reach Overpass again.
$PINNED_DIR = $CACHE_DIR . 'pinned/';
$PINNED_OFF = getenv('MAPEXPORT_CACHE_IGNORE_PINNED') === '1'
    || file_exists($PINNED_DIR . '.disabled');

// $key is validated before any call, so it cannot escape $PINNED_DIR.
function pinnedPath($pinnedDir, $key, $off) {
    if ($off) return null;
    foreach ([$key . '.json.gz', $key . '.json'] as $name) {
        if (is_file($pinnedDir . $name)) return $pinnedDir . $name;
    }
    return null;
}

// ME-04a: hard payload bounds. The client gzips uploads specifically to stay
// under typical hosting's post_max_size (8M), so anything larger arriving
// here is not one of our exports. The decompressed bound caps gzip bombs;
// real Overpass tiles compress ~8-12x, so 8 MiB received / 80 MiB decoded
// leaves generous headroom over every measured export.
$MAX_BODY_BYTES    = 8 * 1024 * 1024;
$MAX_DECODED_BYTES = 80 * 1024 * 1024;

// ME-04c write-authorization model (decided by Coen, 2026-07-14): browsers
// keep writing directly — a server-side Overpass proxy would funnel every
// user's Overpass traffic through this one server IP and get the whole
// service throttled — so abuse is bounded instead of authenticated: the
// upload validation above, a per-IP write rate limit, and a total-size cap
// pruning oldest entries first. The env overrides exist for the request
// tests; production runs on these defaults.
$envInt = function ($name, $default) {
    $v = getenv($name); // NB: not `?:` — an explicit "0" must stay 0
    return ($v === false || $v === '') ? $default : (int)$v;
};
$RL_MAX_WRITES   = $envInt('MAPEXPORT_CACHE_RL_MAX', 300);      // per IP per window
$RL_WINDOW       = $envInt('MAPEXPORT_CACHE_RL_WINDOW', 600);   // seconds
$MAX_CACHE_BYTES = $envInt('MAPEXPORT_CACHE_MAX_BYTES', 2147483648); // 2 GiB
$SWEEP_INTERVAL  = $envInt('MAPEXPORT_CACHE_SWEEP_INTERVAL', 300);   // seconds

// Fixed-window per-IP write counter in cache/.ratelimit/ (REMOTE_ADDR only —
// the app sits behind no proxy, so forwarded headers are attacker-controlled).
// Counts attempts, not successes, so hammering rejects doesn't stay free.
// Fails open: a broken limiter must never break exports, it only stops
// guarding them.
function writeRateLimited($cacheDir, $max, $window) {
    $dir = $cacheDir . '.ratelimit/';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $fh = @fopen($dir . 'rl_' . substr(sha1($_SERVER['REMOTE_ADDR'] ?? ''), 0, 16), 'c+');
    if (!$fh || !flock($fh, LOCK_EX)) { if ($fh) fclose($fh); return false; }
    $now = time();
    $parts = explode(' ', trim((string)stream_get_contents($fh)));
    $start = (int)($parts[0] ?? 0);
    $count = ($now - $start >= $window) ? 0 : (int)($parts[1] ?? 0);
    if ($count === 0) $start = $now;
    $count++;
    ftruncate($fh, 0); rewind($fh); fwrite($fh, "$start $count");
    flock($fh, LOCK_UN); fclose($fh);
    if ($count <= $max) return false;
    header('Retry-After: ' . max(1, $start + $window - $now));
    return true;
}

// Opportunistic cleanup, at most once per $interval and behind a non-blocking
// lock so concurrent uploads don't stampede: proactively drop TTL-expired
// entries (lazy expiry only fires when a key is read), then, if the cache
// still exceeds $maxBytes, prune oldest-mtime entries down to 90% of the cap.
function sweepCache($cacheDir, $maxBytes, $ttl, $interval, $rlWindow) {
    $marker = $cacheDir . '.lastsweep';
    if (file_exists($marker) && time() - filemtime($marker) < $interval) return;
    $fh = @fopen($marker, 'c');
    if (!$fh) return;
    if (!flock($fh, LOCK_EX | LOCK_NB)) { fclose($fh); return; }
    touch($marker);
    $now = time();
    $entries = []; $total = 0;
    foreach (array_merge(glob($cacheDir . '*.json.gz') ?: [], glob($cacheDir . '*.json') ?: []) as $p) {
        $mtime = @filemtime($p); $size = @filesize($p);
        if ($mtime === false || $size === false) continue;
        if ($now - $mtime > $ttl) { @unlink($p); continue; }
        $entries[] = [$mtime, $size, $p];
        $total += $size;
    }
    if ($total > $maxBytes) {
        usort($entries, fn($a, $b) => $a[0] <=> $b[0]);
        foreach ($entries as [, $size, $p]) {
            if ($total <= (int)($maxBytes * 0.9)) break;
            if (@unlink($p)) $total -= $size;
        }
    }
    foreach (glob($cacheDir . '.ratelimit/rl_*') ?: [] as $p) {
        if ($now - (@filemtime($p) ?: $now) > 2 * $rlWindow) @unlink($p);
    }
    flock($fh, LOCK_UN); fclose($fh);
}

function validKey($k) { return preg_match('/^[a-z0-9_.\-]+$/i', $k) && strlen($k) > 0 && strlen($k) <= 120; }

// Overpass responses (and the client's {elements:[...]} envelopes) put the
// "elements" key well inside the first 4 KiB. This is a head-structure check,
// not a full parse: full-body json_decode of an 80 MiB tile would double
// peak memory for no extra integrity (a torn upload is already caught by the
// gzip stream check, and a hand-crafted valid-JSON payload passes any parse).
function looksLikeOverpassJson($prefix, $tail) {
    return substr(ltrim($prefix), 0, 1) === '{'
        && strpos($prefix, '"elements"') !== false
        && substr(rtrim($tail), -1) === '}';
}

// §2.2: batch existence check. Takes ?exists=k1,k2,… (max 64 keys),
// returns {k1:true|false, …}. Lets the client skip per-key round-trips
// during the pre-fetch cache probe. Data retrieval still uses single-key
// GETs so we can keep Content-Encoding: gzip passthrough for big tiles.
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['exists'])) {
    header('Content-Type: application/json');
    $keys = array_slice(array_filter(explode(',', $_GET['exists']), 'strlen'), 0, 64);
    $out = [];
    foreach ($keys as $k) {
        if (!validKey($k)) { $out[$k] = false; continue; }
        $f  = $CACHE_DIR . $k . '.json.gz';
        $fl = $CACHE_DIR . $k . '.json';
        $hit = false;
        foreach ([$f, $fl] as $p) {
            if (file_exists($p)) {
                if (time() - filemtime($p) > $CACHE_TTL) { @unlink($p); continue; }
                $hit = true; break;
            }
        }
        $out[$k] = $hit || pinnedPath($PINNED_DIR, $k, $PINNED_OFF) !== null;
    }
    echo json_encode($out);
    exit;
}

$key = $_GET['key'] ?? '';

// Strict validation — alphanumeric, underscores, dots, hyphens only (no
// slashes, so keys cannot escape $CACHE_DIR). Temp files carry a "." prefix
// and no .json.gz suffix, so no key can address one.
if (!validKey($key)) {
    http_response_code(400); exit;
}

$file = $CACHE_DIR . $key . '.json.gz';
// Legacy uncompressed file path
$fileLegacy = $CACHE_DIR . $key . '.json';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    header('Content-Type: application/json');

    // Try compressed file first, then the legacy uncompressed one. An expired
    // entry is dropped but does not end the request: a pinned copy may still
    // answer it.
    if (file_exists($file)) {
        if (time() - filemtime($file) > $CACHE_TTL) { unlink($file); }
        else {
            header('X-Cache: HIT');
            header('Content-Encoding: gzip');
            header('Content-Length: ' . filesize($file));
            readfile($file);
            exit;
        }
    }
    if (file_exists($fileLegacy)) {
        if (time() - filemtime($fileLegacy) > $CACHE_TTL) { unlink($fileLegacy); }
        else {
            header('X-Cache: HIT');
            readfile($fileLegacy);
            exit;
        }
    }
    // Never-expiring fallback for the pinned validation areas.
    $pin = pinnedPath($PINNED_DIR, $key, $PINNED_OFF);
    if ($pin !== null) {
        header('X-Cache: PINNED');
        if (substr($pin, -3) === '.gz') header('Content-Encoding: gzip');
        header('Content-Length: ' . filesize($pin));
        readfile($pin);
        exit;
    }
    echo 'null';

} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!is_dir($CACHE_DIR)) mkdir($CACHE_DIR, 0755, true);

    // ME-04a: reject anything that isn't our own uploader's shape before
    // touching disk: JSON content type, gzip or identity encoding, and a
    // declared length within bounds (the read loop re-enforces the cap, so a
    // lying Content-Length still can't get past it).
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (strncasecmp($contentType, 'application/json', 16) !== 0) {
        http_response_code(415); exit;
    }
    $contentEncoding = $_SERVER['HTTP_CONTENT_ENCODING'] ?? '';
    if ($contentEncoding !== '' && $contentEncoding !== 'identity' && $contentEncoding !== 'gzip') {
        http_response_code(415); exit;
    }
    $isGzip = ($contentEncoding === 'gzip');
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $MAX_BODY_BYTES) {
        http_response_code(413); exit;
    }

    // ME-04c: per-IP write throttle, before the body is read. The client
    // treats any failed cache write as a plain miss, so a 429 costs one
    // re-fetch from Overpass, never a failed export.
    if (writeRateLimited($CACHE_DIR, $RL_MAX_WRITES, $RL_WINDOW)) {
        http_response_code(429); exit;
    }

    // ME-04b: reap temp files that an aborted upload may have stranded.
    // Anything .tmp-prefixed older than an hour is garbage by construction.
    foreach (glob($CACHE_DIR . '.tmp*') ?: [] as $stale) {
        if (time() - (@filemtime($stale) ?: time()) > 3600) @unlink($stale);
    }

    // ME-04b: stage the upload in a unique temp file in the same directory,
    // then rename onto the final path only after every check passed. Readers
    // therefore always see the complete old or complete new file, and a
    // pre-planted symlink at the final path is replaced (rename swaps the
    // link itself, never writes through it).
    $tmp = tempnam($CACHE_DIR, '.tmp');
    if ($tmp === false || dirname($tmp) !== rtrim($CACHE_DIR, '/')) {
        if ($tmp !== false) @unlink($tmp);
        http_response_code(500); exit;
    }

    $fail = function ($code) use ($tmp) { @unlink($tmp); http_response_code($code); exit; };

    $input  = fopen('php://input', 'rb');
    $output = fopen($tmp, 'wb');
    if (!$input || !$output) $fail(500);

    if ($isGzip) {
        // Store the received gzip bytes verbatim (GET serves them back with
        // Content-Encoding: gzip), but stream-validate while they arrive:
        // count received and decompressed bytes against the caps and keep the
        // head/tail of the decompressed text for the structure check. The
        // whole body is never held in memory.
        $inflate = inflate_init(ZLIB_ENCODING_GZIP);
        if (!$inflate) $fail(500);
        $received = 0; $decoded = 0; $prefix = ''; $tail = '';
        while (!feof($input)) {
            $chunk = fread($input, 65536);
            if ($chunk === false) $fail(500);
            if ($chunk === '') continue;
            $received += strlen($chunk);
            if ($received > $MAX_BODY_BYTES) $fail(413);
            $plain = @inflate_add($inflate, $chunk);
            if ($plain === false) $fail(400); // corrupt gzip stream
            $decoded += strlen($plain);
            if ($decoded > $MAX_DECODED_BYTES) $fail(413);
            if (strlen($prefix) < 4096) $prefix .= substr($plain, 0, 4096 - strlen($prefix));
            $tail = substr($tail . $plain, -64);
            if (fwrite($output, $chunk) !== strlen($chunk)) $fail(500);
        }
        // A truncated upload leaves the stream unfinished; trailing garbage
        // after the gzip member is equally not one of ours.
        if (inflate_get_status($inflate) !== ZLIB_STREAM_END) $fail(400);
        if ($decoded === 0 || !looksLikeOverpassJson($prefix, $tail)) $fail(400);
    } else {
        // Plain JSON is the no-CompressionStream fallback, so it stays small;
        // the received-bytes cap applies to it directly. Bounded enough to
        // parse fully, then stored gzip-compressed like everything else.
        $body = ''; $received = 0;
        while (!feof($input)) {
            $chunk = fread($input, 65536);
            if ($chunk === false) $fail(500);
            $received += strlen($chunk);
            if ($received > $MAX_BODY_BYTES) $fail(413);
            $body .= $chunk;
        }
        $doc = json_decode($body, true);
        if (!is_array($doc) || !isset($doc['elements']) || !is_array($doc['elements'])) $fail(400);
        if (fwrite($output, gzencode($body, 6)) === false) $fail(500);
    }

    fclose($input);
    if (!fflush($output) || !fclose($output)) $fail(500);
    chmod($tmp, 0644);
    if (!rename($tmp, $file)) $fail(500);

    // Remove legacy uncompressed file if it exists
    if (file_exists($fileLegacy)) @unlink($fileLegacy);

    // ME-04c: bound total cache size now that this write landed.
    sweepCache($CACHE_DIR, $MAX_CACHE_BYTES, $CACHE_TTL, $SWEEP_INTERVAL, $RL_WINDOW);
    http_response_code(204);

} else {
    header('Allow: GET, POST');
    http_response_code(405);
}
