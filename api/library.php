<?php
/* The archive's only server code.

   Anyone:     GET                  → the public shelf: no notes, no private items
               GET ?cover=<id>      → a cover image, unless its book is private
   Librarian:  POST {op:"login", password}   → a signed, HttpOnly cookie for 7 days
               POST {op:"logout"}
               POST {op:"put", item} | {op:"delete", id}
   Lists and edits answer {owner, items}.

   The password itself is never stored. api/config.php holds a bcrypt hash and
   a random signing key, written on your own computer by `php api/setup.php`. */

declare(strict_types=1);

ini_set('display_errors', '0');      /* errors go to the server log, never to the page */
error_reporting(E_ALL);
header_remove('X-Powered-By');

const DATA      = __DIR__ . '/../data/library.php';
const COVERS    = __DIR__ . '/../data/covers';
const THROTTLE  = __DIR__ . '/../data/throttle.php';
/* The first line of every data file. Should a misconfigured server ever serve
   one, PHP runs this line and nothing of the file is shown. */
const GUARD     = "<?php http_response_code(404); exit; ?>\n";
const ID_RE     = '/^[a-z0-9-]{8,40}$/';
const MAX_BYTES = 4194304;           /* a 200,000-character scroll or a cover image, plus JSON escaping */
const MAX_COVER = 2097152;
const COOKIE    = 'archive_owner';
const DAYS      = 7;                 /* how long a sign-in lasts */
const WINDOW    = 900;               /* wrong passwords are remembered for 15 minutes; */
const PER_IP    = 5;                 /* this many from one address, */
const OVERALL   = 30;                /* or this many from anywhere, closes sign-in until they age out */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

function reply(int $status, $body = null): void {
  http_response_code($status);
  if ($body !== null) echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}

/* ---- data files ---- */

/* An array; [] when the file doesn't exist yet; false when it is damaged. */
function read_data(string $file) {
  if (!is_file($file)) return [];
  $s = (string)file_get_contents($file);
  $v = str_starts_with($s, GUARD) ? json_decode(substr($s, strlen(GUARD)), true) : null;
  return is_array($v) ? $v : false;
}

/* Written to a new file and swapped in, so a failed write never leaves half a
   file. JSON_HEX_TAG keeps "<" and ">" out of the file, so nothing anyone
   types can ever read as PHP after the guard. */
function write_data(string $file, array $value): bool {
  $data = GUARD . json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_HEX_TAG);
  $tmp = substr($file, 0, -4) . '.tmp.php';
  return file_put_contents($tmp, $data) === strlen($data) && rename($tmp, $file);
}

/* ---- who is asking ---- */

/* Read as data, not loaded as code: PHP's code cache could otherwise keep
   using an old password for a while after a new one is set. */
$cfg = read_data(__DIR__ . '/config.php') ?: null;
if (!is_array($cfg) || !is_string($cfg['hash'] ?? null) || !preg_match('/^[0-9a-f]{64}$/', (string)($cfg['secret'] ?? ''))) $cfg = null;

/* The password hash is part of what is signed, so setting a new password
   signs every browser out. */
function token(array $cfg, int $until): string {
  return $until . '.' . hash_hmac('sha256', "owner|$until|{$cfg['hash']}", $cfg['secret']);
}
function is_owner(?array $cfg): bool {
  $c = (string)($_COOKIE[COOKIE] ?? '');
  if (!$cfg || !preg_match('/^(\d{1,12})\.[0-9a-f]{64}$/', $c, $m)) return false;
  return (int)$m[1] > time() && hash_equals(token($cfg, (int)$m[1]), $c);
}
/* HttpOnly: page scripts can't read it. SameSite=Strict: other sites can't
   send it. Secure: only over HTTPS (your own computer has no HTTPS). */
function cookie(string $value, int $until, bool $https): void {
  setcookie(COOKIE, $value, ['expires' => $until, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
}

/* What may be shown: visitors get no private items and no notes. Covers
   become addresses that this file serves (and checks) itself. */
function view(array $items, bool $owner): array {
  $out = [];
  foreach ($items as $it) {
    if (!$owner && !empty($it['private'])) continue;
    if (!$owner) unset($it['notes'], $it['private']);
    if (isset($it['cover'])) $it['cover'] = $it['cover'] === '' ? '' : "api/library.php?cover={$it['id']}&v={$it['cover']}";
    $out[] = $it;
  }
  return $out;
}

$local = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
$owner = is_owner($cfg);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$damaged = $owner ? 'data/library.php is damaged. data/library.bak.php holds the version before.' : 'The archive is unavailable right now.';

/* ---- reading ---- */

if ($method === 'GET') {
  $items = read_data(DATA);
  if ($items === false) reply(500, ['error' => $damaged]);
  if (!isset($_GET['cover'])) reply(200, ['owner' => $owner, 'items' => view($items, $owner)]);

  $id = (string)$_GET['cover'];
  $at = preg_match(ID_RE, $id) ? array_search($id, array_column($items, 'id'), true) : false;
  $file = COVERS . "/$id.jpg";
  if ($at === false || ($items[$at]['cover'] ?? '') === '' || (!$owner && !empty($items[$at]['private'])) || !is_file($file)) reply(404);
  header('Content-Type: image/jpeg');
  header('Cache-Control: private, max-age=31536000, immutable');   /* the address changes when the cover does */
  header('Content-Length: ' . filesize($file));
  readfile($file);
  exit;
}

/* ---- writing ---- */

if ($method !== 'POST') reply(405, ['error' => 'Not allowed.']);

/* The password and the cookie only ever travel encrypted. */
if (!$https && !$local) reply(403, ['error' => 'This needs HTTPS.']);

/* Only this site's own page may post here: another site's form cannot send
   JSON, and the origin a browser reports must be this one. */
if (!str_starts_with((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) reply(415, ['error' => 'Expected JSON.']);
$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origin !== '' && $origin !== ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '')) reply(403, ['error' => 'Not allowed from another site.']);

$raw = file_get_contents('php://input', false, null, 0, MAX_BYTES + 1);
if ($raw === false || strlen($raw) > MAX_BYTES) reply(413, ['error' => 'That is too long to save.']);
$req = json_decode($raw, true);
if (!is_array($req)) reply(400, ['error' => 'Expected JSON.']);
$op = $req['op'] ?? '';

$dir = dirname(DATA);
if (!is_dir($dir) && !mkdir($dir, 0755)) reply(500, ['error' => 'Could not create the data folder.']);

/* One request at a time from here; held until the script ends. */
$lock = fopen("$dir/.lock", 'c');
if (!$lock || !flock($lock, LOCK_EX)) reply(500, ['error' => 'Could not lock the library.']);

/* Never write over a file we could not read: that would wipe the library. */
$items = read_data(DATA);
if ($items === false) reply(500, ['error' => $damaged]);

if ($op === 'logout') {
  cookie('', 1, $https);
  reply(200, ['owner' => false, 'items' => view($items, false)]);
}

if ($op === 'login') {
  if (!$cfg) reply(503, ['error' => 'No password has been set yet. On your computer, run: php api/setup.php']);
  $who = hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? ''));   /* addresses are kept only as hashes */
  $fails = read_data(THROTTLE) ?: [];
  $fails = array_values(array_filter($fails, fn($f) => is_array($f) && ($f[0] ?? 0) > time() - WINDOW));
  $mine = count(array_filter($fails, fn($f) => ($f[1] ?? '') === $who));
  if ($mine >= PER_IP || count($fails) >= OVERALL) reply(429, ['error' => 'Too many wrong passwords. Wait 15 minutes, then try again.']);

  $pw = $req['password'] ?? null;
  if (!is_string($pw) || strlen($pw) > 1000 || !password_verify($pw, $cfg['hash'])) {
    $fails[] = [time(), $who];
    write_data(THROTTLE, $fails);
    usleep(random_int(400000, 900000));
    reply(401, ['error' => 'That is not the password.']);
  }
  $until = time() + DAYS * 86400;
  cookie(token($cfg, $until), $until, $https);
  reply(200, ['owner' => true, 'items' => view($items, true)]);
}

if (!$owner) reply(401, ['error' => 'Sign in to make changes.']);

/* Returns the cleaned item, or a string saying what is wrong with it. Only
   these fields are kept; anything else sent is dropped. A cover can only be
   kept or removed here; a new one arrives as image data (see below). */
function clean($in, string $id, string $added, string $oldCover) {
  if (!is_array($in)) return 'Missing item.';
  $kind = $in['kind'] ?? null;
  if ($kind !== 'book' && $kind !== 'scroll') return 'Kind must be book or scroll.';

  $out = ['id' => $id, 'kind' => $kind];
  $limits = ['title' => 200, 'author' => 120, 'genre' => 120, 'notes' => 20000];
  $limits += $kind === 'scroll' ? ['text' => 200000] : ['isbn' => 20];
  foreach ($limits as $field => $max) {
    $v = $in[$field] ?? '';
    if (!is_string($v) || mb_strlen($v) > $max) return "The $field must be text of at most $max characters.";
    $out[$field] = trim($v);
  }
  if ($out['title'] === '') return 'A title is needed.';

  $rating = $in['rating'] ?? 0;
  if (!is_int($rating) || $rating < 0 || $rating > 5) return 'Rating must be 0 to 5.';
  $out['rating'] = $rating;

  $year = $in['year'] ?? null;
  if ($year !== null && (!is_int($year) || $year < -3000 || $year > 2100)) return 'Year must be a whole number (negative for BC).';
  $out['year'] = $year;

  $private = $in['private'] ?? false;
  if (!is_bool($private)) return 'Private must be true or false.';
  $out['private'] = $private;

  if ($kind === 'book') {
    $pages = $in['pages'] ?? null;
    if (!is_int($pages) || $pages < 1 || $pages > 20000) return 'Pages must be a whole number from 1 to 20,000.';
    $out['pages'] = $pages;
    if (!preg_match('/^[0-9Xx -]*$/', $out['isbn'])) return 'An ISBN has only digits, X, spaces and dashes.';
    $color = $in['color'] ?? '';
    if (!is_string($color) || !preg_match('/^(#[0-9a-f]{6})?$/', $color)) return 'Bad spine colour.';
    $out['color'] = $color;
    $cover = $in['cover'] ?? '';
    if (!is_string($cover)) return 'Bad cover.';
    $out['cover'] = $cover === '' ? '' : $oldCover;   /* anything else means "keep it" */
  }
  $out['added'] = $added;
  return $out;
}

$id = $req['id'] ?? $req['item']['id'] ?? '';
if (!is_string($id) || !preg_match(ID_RE, $id)) reply(400, ['error' => 'Bad id.']);
$at = array_search($id, array_column($items, 'id'), true);
$old = $at === false ? null : $items[$at];
$oldCover = $old['cover'] ?? '';
$coverFile = COVERS . "/$id.jpg";

if ($op === 'delete') {
  if ($at !== false) array_splice($items, $at, 1);
  $item = [];
} elseif ($op === 'put') {
  $item = clean($req['item'] ?? null, $id, $old['added'] ?? gmdate('Y-m-d'), $oldCover);
  if (is_string($item)) reply(400, ['error' => $item]);

  /* A new cover arrives as a JPEG data URL, already shrunk by the browser.
     It is checked to really be a JPEG before it is stored. */
  $data = $req['item']['coverData'] ?? null;
  if ($item['kind'] === 'book' && $data !== null) {
    $prefix = 'data:image/jpeg;base64,';
    if (!is_string($data) || !str_starts_with($data, $prefix)) reply(400, ['error' => 'A cover must be a JPEG image.']);
    $bin = base64_decode(substr($data, strlen($prefix)), true);
    if ($bin === false || strlen($bin) > MAX_COVER) reply(400, ['error' => 'That cover image is too large.']);
    $size = @getimagesizefromstring($bin);
    if (!$size || $size[2] !== IMAGETYPE_JPEG || $size[0] > 4000 || $size[1] > 4000) reply(400, ['error' => 'That cover is not a readable JPEG.']);
    if (!is_dir(COVERS) && !mkdir(COVERS, 0755)) reply(500, ['error' => 'Could not create the covers folder.']);
    if (file_put_contents("$coverFile.tmp", $bin) !== strlen($bin) || !rename("$coverFile.tmp", $coverFile)) {
      reply(500, ['error' => 'Could not save the cover. Nothing was changed.']);
    }
    $item['cover'] = bin2hex(random_bytes(4));   /* a new version, so browsers fetch the new image */
  }
  if ($at === false) $items[] = $item; else $items[$at] = $item;
} else {
  reply(400, ['error' => 'Unknown request.']);
}

/* The previous version is kept as library.bak.php. */
if (is_file(DATA)) copy(DATA, "$dir/library.bak.php");
if (!write_data(DATA, $items)) reply(500, ['error' => 'Could not save. Nothing was changed.']);
/* Only once the library no longer mentions it does a cover file go. */
if ($oldCover !== '' && ($item['cover'] ?? '') === '' && is_file($coverFile)) unlink($coverFile);
reply(200, ['owner' => true, 'items' => view($items, true)]);
