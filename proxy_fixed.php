<?php
// PHP proxy for Node.js API requests
// Forwards requests from Apache/LiteSpeed to Node.js backend

// Suppress errors from output (log them instead)
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

$path = $_GET['path'] ?? '';
if (!$path) {
    http_response_code(400);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode(['error' => 'Missing path']);
    exit;
}

// Build clean URL - forward original query params but NOT the proxy "path" param
$forwardParams = $_GET;
unset($forwardParams['path']); // Remove proxy-internal param

$url = 'http://127.0.0.1:5000/api/' . ltrim($path, '/');
if (!empty($forwardParams)) {
    $url .= '?' . http_build_query($forwardParams);
}

// Get request method
$method = $_SERVER['REQUEST_METHOD'];

// Identify if it's a multipart request (requires special handling for body)
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
$isMultipart = (strpos(strtolower($contentType), 'multipart/form-data') !== false);

// Collect request headers to forward (skip hop-by-hop and host)
$skipHeaders = ['host', 'connection', 'transfer-encoding', 'te', 'trailers', 'upgrade',
                'proxy-authorization', 'proxy-authenticate', 'keep-alive'];
$headers = [];
foreach (getallheaders() as $name => $value) {
    $lowerName = strtolower($name);
    if (in_array($lowerName, $skipHeaders, true)) continue;
    
    // For multipart: skip Content-Type (cURL sets its own with the correct boundary)
    // AND skip Content-Length (cURL rebuilds the body so the original length is wrong)
    if ($isMultipart && ($lowerName === 'content-type' || $lowerName === 'content-length')) continue;
    
    $headers[] = $name . ': ' . $value;
}

// Read request body (for POST/PUT/PATCH/DELETE)
$body = null;
if (!in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
    if ($isMultipart) {
        // For multipart, build the body array using $_POST and $_FILES
        // This is necessary because php://input is empty for multipart/form-data
        $body = $_POST;
        foreach ($_FILES as $name => $file) {
            if (is_array($file['tmp_name'])) {
                // Handle multiple files with same name
                foreach ($file['tmp_name'] as $idx => $tmpPath) {
                    if (!$tmpPath) continue;
                    $body[$name . '[' . $idx . ']'] = new CURLFile(
                        $tmpPath,
                        $file['type'][$idx],
                        $file['name'][$idx]
                    );
                }
            } else {
                if ($file['tmp_name']) {
                    $body[$name] = new CURLFile(
                        $file['tmp_name'],
                        $file['type'],
                        $file['name']
                    );
                }
            }
        }
    } else {
        $body = file_get_contents('php://input');
    }
}

// Execute curl request to Node.js
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER         => true,       // Include response headers in output
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_HTTPHEADER     => $headers,
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_FOLLOWLOCATION => false,      // Do NOT follow redirects (preserve auth)
]);

if ($body !== null && $body !== '') {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

$raw = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(503);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode(['error' => 'Backend unavailable', 'details' => $curlError]);
    exit;
}

// Split response headers and body
$responseHeaders = substr($raw, 0, $headerSize);
$responseBody    = substr($raw, $headerSize);

// Headers to skip when forwarding to client (hop-by-hop)
$skipResponseHeaders = ['transfer-encoding', 'connection', 'keep-alive', 'te', 'trailers',
                        'upgrade', 'proxy-authenticate', 'proxy-authorization'];

// Forward response headers to client
foreach (explode("\r\n", $responseHeaders) as $line) {
    $line = trim($line);
    if (empty($line) || preg_match('/^HTTP\//i', $line)) continue;

    $colonPos = strpos($line, ':');
    if ($colonPos === false) continue;

    $headerName  = strtolower(trim(substr($line, 0, $colonPos)));
    $headerValue = trim(substr($line, $colonPos + 1));

    if (in_array($headerName, $skipResponseHeaders, true)) continue;

    // Forward Set-Cookie with header() - allows multiple cookies
    if ($headerName === 'set-cookie') {
        header('Set-Cookie: ' . $headerValue, false);
    } else {
        header($headerName . ': ' . $headerValue, true);
    }
}

// Always add cache-control: no-store for API responses (prevent LiteSpeed from caching)
header('Cache-Control: no-store, no-cache, must-revalidate', true);
header('Pragma: no-cache', true);
header('X-Proxy: node', true);

// Send response code and body
http_response_code($httpCode);
echo $responseBody;
