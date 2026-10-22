<?php
/* Sets the librarian password. Run it on your own computer:

     php api/setup.php

   It writes api/config.php: a one-way (bcrypt) hash of the password and a
   random signing key, never the password itself. Upload that file to the
   server's api/ folder. Running this again changes the password and signs
   every browser out. It keeps the signing key, which also unlocks the shared
   links' passwords; to change the key as well, delete api/config.php first. */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }   /* never from the web */

function ask(string $prompt): string {
  fwrite(STDOUT, $prompt);
  $tty = stream_isatty(STDIN);
  if ($tty) system('stty -echo');                 /* don't show the password as it's typed */
  $line = fgets(STDIN);
  if ($tty) { system('stty echo'); fwrite(STDOUT, "\n"); }
  return rtrim((string)$line, "\r\n");
}

$pw = ask('New password (12 or more characters): ');
if (mb_strlen($pw) < 12) { fwrite(STDERR, "Too short. Use at least 12 characters. Nothing was changed.\n"); exit(1); }
if (strlen($pw) > 72) { fwrite(STDERR, "Too long. Use at most 72 bytes. Nothing was changed.\n"); exit(1); }
if (ask('Type it again: ') !== $pw) { fwrite(STDERR, "The two didn't match. Nothing was changed.\n"); exit(1); }

/* bcrypt works on every PHP host, so a file made here also works on the server. */
$file = __DIR__ . '/config.php';
/* The same guard line as the data files: requested from the web, it shows nothing. */
$guard = "<?php http_response_code(404); exit; ?>\n";
$old = is_file($file) ? json_decode(substr((string)file_get_contents($file), strlen($guard)), true) : null;
$secret = is_string($old['secret'] ?? null) && preg_match('/^[0-9a-f]{64}$/', $old['secret']) ? $old['secret'] : bin2hex(random_bytes(32));
$cfg = ['hash' => password_hash($pw, PASSWORD_BCRYPT, ['cost' => 12]), 'secret' => $secret];
$php = $guard . json_encode($cfg, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_HEX_TAG);
if (file_put_contents($file, $php) !== strlen($php)) { fwrite(STDERR, "Could not write api/config.php.\n"); exit(1); }
chmod($file, 0600);
echo "Saved api/config.php. Upload it to the server's api/ folder.\n";
