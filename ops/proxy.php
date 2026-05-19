<?php
/**
 * Local-only API proxy for cPanel/Apache domain root.
 *
 * .htaccess rewrites /api/* to this file. The proxy forwards requests only to
 * the local Node.js backends managed by PM2, never to arbitrary external URLs.
 */

$path = isset($_GET['path']) ? trim((string) $_GET['path']) : '';
$path = ltrim($path, '/');

if ($path === '' || strpos($path, '..') !== false || preg_match('/[\x00-\x1F\x7F]/', $path)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['message' => 'Invalid API path']);
    exit;
}

$query = $_GET;
unset($query['path']);
$queryString = http_build_query($query);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$body = null;
$upstreams = [
    'http://127.0.0.1:5000/api/' . $path,
    'http://127.0.0.1:5001/api/' . $path,
];

$incomingHeaders = function_exists('getallheaders') ? (getallheaders() ?: []) : [];
if (!$incomingHeaders) {
    foreach ($_SERVER as $name => $value) {
        if (strpos($name, 'HTTP_') !== 0) {
            continue;
        }
        $headerName = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))));
        $incomingHeaders[$headerName] = $value;
    }
}

$incomingContentType = '';
foreach ($incomingHeaders as $name => $value) {
    if (strtolower($name) === 'content-type') {
        $incomingContentType = (string) $value;
        break;
    }
}
$isMultipart = stripos($incomingContentType, 'multipart/form-data') !== false;

$requestHeaders = [];
foreach ($incomingHeaders as $name => $value) {
    $lower = strtolower($name);
    if (in_array($lower, ['host', 'content-length', 'connection', 'expect'], true)) {
        continue;
    }
    if ($isMultipart && $lower === 'content-type') {
        continue;
    }
    $requestHeaders[] = $name . ': ' . $value;
}

if ($isMultipart) {
    $boundary = '----OfficeProxyBoundary' . bin2hex(random_bytes(12));
    $parts = [];

    foreach ($_POST as $fieldName => $fieldValue) {
        $values = is_array($fieldValue) ? $fieldValue : [$fieldValue];
        foreach ($values as $value) {
            $parts[] = '--' . $boundary . "\r\n"
                . 'Content-Disposition: form-data; name="' . addcslashes((string) $fieldName, "\\\"") . '"' . "\r\n\r\n"
                . (string) $value . "\r\n";
        }
    }

    foreach ($_FILES as $fieldName => $fileInfo) {
        $files = [];
        if (is_array($fileInfo['name'])) {
            foreach ($fileInfo['name'] as $idx => $name) {
                $files[] = [
                    'name' => $name,
                    'type' => $fileInfo['type'][$idx] ?? 'application/octet-stream',
                    'tmp_name' => $fileInfo['tmp_name'][$idx] ?? '',
                    'error' => $fileInfo['error'][$idx] ?? UPLOAD_ERR_NO_FILE,
                ];
            }
        } else {
            $files[] = $fileInfo;
        }

        foreach ($files as $file) {
            if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'] ?? '')) {
                continue;
            }
            $fileName = basename((string) ($file['name'] ?? 'upload.bin'));
            $mimeType = (string) ($file['type'] ?? 'application/octet-stream');
            $parts[] = '--' . $boundary . "\r\n"
                . 'Content-Disposition: form-data; name="' . addcslashes((string) $fieldName, "\\\"") . '"; filename="' . addcslashes($fileName, "\\\"") . '"' . "\r\n"
                . 'Content-Type: ' . $mimeType . "\r\n\r\n"
                . file_get_contents($file['tmp_name']) . "\r\n";
        }
    }

    $body = implode('', $parts) . '--' . $boundary . "--\r\n";
    $requestHeaders[] = 'Content-Type: multipart/form-data; boundary=' . $boundary;
} else {
    $body = file_get_contents('php://input');
}

if (!function_exists('curl_init')) {
    foreach ($upstreams as $baseUrl) {
        $url = $baseUrl . ($queryString ? '?' . $queryString : '');
        $context = stream_context_create([
            'http' => [
                'method' => $method,
                'header' => implode("\r\n", $requestHeaders),
                'content' => $body,
                'ignore_errors' => true,
                'timeout' => 20,
            ],
        ]);
        $response = @file_get_contents($url, false, $context);
        if ($response !== false) {
            $status = 200;
            foreach ($http_response_header ?? [] as $headerLine) {
                if (preg_match('#^HTTP/\S+\s+(\d+)#', $headerLine, $m)) {
                    $status = (int) $m[1];
                    continue;
                }
                if (stripos($headerLine, 'Transfer-Encoding:') === 0 || stripos($headerLine, 'Connection:') === 0) {
                    continue;
                }
                header($headerLine, false);
            }
            http_response_code($status);
            echo $response;
            exit;
        }
    }

    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['message' => 'API upstream unavailable']);
    exit;
}

$lastError = null;
foreach ($upstreams as $baseUrl) {
    $url = $baseUrl . ($queryString ? '?' . $queryString : '');
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $requestHeaders,
        CURLOPT_POSTFIELDS => in_array($method, ['GET', 'HEAD'], true) ? null : $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_FOLLOWLOCATION => false,
    ]);

    $raw = curl_exec($ch);
    if ($raw === false) {
        $lastError = curl_error($ch);
        curl_close($ch);
        continue;
    }

    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE) ?: 502;
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE) ?: 0;
    $rawHeaders = substr($raw, 0, $headerSize);
    $responseBody = substr($raw, $headerSize);
    curl_close($ch);

    http_response_code($status);
    foreach (explode("\r\n", $rawHeaders) as $headerLine) {
        if ($headerLine === '' || stripos($headerLine, 'HTTP/') === 0) {
            continue;
        }
        if (stripos($headerLine, 'Transfer-Encoding:') === 0 || stripos($headerLine, 'Connection:') === 0) {
            continue;
        }
        header($headerLine, false);
    }
    echo $responseBody;
    exit;
}

http_response_code(502);
header('Content-Type: application/json');
echo json_encode([
    'message' => 'API upstream unavailable',
    'error' => $lastError,
]);
