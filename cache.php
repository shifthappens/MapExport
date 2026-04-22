<?php
$CACHE_DIR = __DIR__ . '/cache/';
$CACHE_TTL = 7 * 24 * 3600; // 7 days

function validKey($k) { return preg_match('/^[a-z0-9_.\-]+$/i', $k) && strlen($k) > 0 && strlen($k) <= 120; }

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
        $out[$k] = $hit;
    }
    echo json_encode($out);
    exit;
}

$key = $_GET['key'] ?? '';

// Strict validation — alphanumeric, underscores, dots, hyphens only (no slashes)
if (!validKey($key)) {
    http_response_code(400); exit;
}

$file = $CACHE_DIR . $key . '.json.gz';
// Legacy uncompressed file path
$fileLegacy = $CACHE_DIR . $key . '.json';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    header('Content-Type: application/json');

    // Try compressed file first
    if (file_exists($file)) {
        if (time() - filemtime($file) > $CACHE_TTL) { unlink($file); echo 'null'; exit; }
        header('X-Cache: HIT');
        header('Content-Encoding: gzip');
        header('Content-Length: ' . filesize($file));
        readfile($file);
        exit;
    }
    // Fall back to legacy uncompressed file
    if (file_exists($fileLegacy)) {
        if (time() - filemtime($fileLegacy) > $CACHE_TTL) { unlink($fileLegacy); echo 'null'; exit; }
        header('X-Cache: HIT');
        readfile($fileLegacy);
        exit;
    }
    echo 'null';

} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!is_dir($CACHE_DIR)) mkdir($CACHE_DIR, 0755, true);
    $contentEncoding = $_SERVER['HTTP_CONTENT_ENCODING'] ?? '';

    if ($contentEncoding === 'gzip') {
        // Client sent gzip — write directly to disk without decompressing.
        // Validation is skipped to avoid memory exhaustion on large payloads;
        // the data came from a trusted source (Overpass API via our own JS).
        $input = fopen('php://input', 'rb');
        $output = fopen($file, 'wb');
        if ($input && $output) {
            stream_copy_to_stream($input, $output);
            fclose($input);
            fclose($output);
        } else {
            http_response_code(500); exit;
        }
    } else {
        // Plain JSON — validate then gzip-compress for storage
        $body = file_get_contents('php://input');
        if (!json_decode($body)) { http_response_code(400); exit; }
        file_put_contents($file, gzencode($body, 6), LOCK_EX);
    }
    // Remove legacy uncompressed file if it exists
    if (file_exists($fileLegacy)) @unlink($fileLegacy);
    http_response_code(204);
}
