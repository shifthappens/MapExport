<?php
$CACHE_DIR = __DIR__ . '/cache/';
$CACHE_TTL = 7 * 24 * 3600; // 7 days
$key = $_GET['key'] ?? '';

// Strict validation — alphanumeric, underscores, dots, hyphens only (no slashes)
if (!preg_match('/^[a-z0-9_.\-]+$/i', $key) || strlen($key) > 120) {
    http_response_code(400); exit;
}

$file = $CACHE_DIR . $key . '.json';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!file_exists($file)) { http_response_code(404); exit; }
    if (time() - filemtime($file) > $CACHE_TTL) { unlink($file); http_response_code(404); exit; }
    header('Content-Type: application/json');
    header('X-Cache: HIT');
    readfile($file);

} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!is_dir($CACHE_DIR)) mkdir($CACHE_DIR, 0755, true);
    $body = file_get_contents('php://input');
    if (!json_decode($body)) { http_response_code(400); exit; }
    file_put_contents($file, $body, LOCK_EX);
    http_response_code(204);
}
