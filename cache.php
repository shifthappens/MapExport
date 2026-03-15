<?php
$CACHE_DIR = __DIR__ . '/cache/';
$CACHE_TTL = 7 * 24 * 3600; // 7 days
$key = $_GET['key'] ?? '';

// Strict validation — alphanumeric, underscores, dots, hyphens only (no slashes)
if (!preg_match('/^[a-z0-9_.\-]+$/i', $key) || strlen($key) > 120) {
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
