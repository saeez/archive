# Archive

A personal bookshelf on a single page: an endless, slowly drifting shelf of 3D
books, each with its real cover and a spine coloured from that cover. Anyone
can browse; only the owner, with a password, can add books, write notes, or see
what is marked private.

Live: **[archive.saeedzafar.se](https://archive.saeedzafar.se)**

Plain HTML, CSS and JavaScript, plus one PHP file. No framework, no build
step, no npm, no database.

## Features

- **The shelf**: books as 3D boxes (cover, spine, page edges) on a rail that
  loops endlessly and drifts by on its own. Scroll, drag or use ← → to browse.
- **Hover** a book and it pulls toward you, with a floating card of its details.
  **Click** it and it slides off the shelf and turns to show its front cover.
- **Real covers**: looked up on [Open Library](https://openlibrary.org) by ISBN
  or by title and author, or uploaded by hand. The spine colour is sampled from
  the cover and adjusted until its lettering is readable (4.5:1 contrast).
- **Spine thickness** follows the page count.
- **Genres** as filter pills; a book with several genres shows under each.
- **Search** across titles, authors, genres and years. Any words, any order,
  accents and capitals ignored.
- **Remarks** (public) and **notes** (private to the owner), each with a small
  formatting toolbar (bold, italic, heading, lists, quotes).
- **Read online**: a book can carry a link (Google Drive, Gutenberg, any web
  address) shown to visitors. Only `http(s)` addresses are accepted.
- **Scrolls**: the owner's own writings can stand on the shelf as rolled-up
  scrolls that unroll when opened.
- **Currently reading**: books ticked as being read stand face out below the
  shelf, covers showing, until they are unticked.
- **Private items**: any book or scroll can be marked private.

## How it's built

| File | Role |
|---|---|
| `index.html` | The single page. |
| `styles.css` | Warm-paper design (oklch colours), 3D book faces, all motion. |
| `app.js` | Everything in the browser: the shelf, 3D flight, search, editor, cover lookup. Pure logic sits above the `/* ---- DOM ---- */` marker so `test.js` can run it. |
| `api/library.php` | The only server code: serves the library, checks the password, saves changes. |
| `api/setup.php` | Command-line tool that sets the owner's password. |
| `fonts/` | Cormorant Garamond, Karla and Space Mono, self-hosted (SIL Open Font License, texts included). |
| `.htaccess` | Apache rules: HTTPS, which files may be served, security headers. |
| `test.js` | Tests for the logic and the real server. |

## Security

- **Visitors never receive notes or private items.** They are removed on the
  server before anything is sent; nothing is merely hidden on screen.
- **Password**: only a bcrypt hash is stored (`api/config.php`, never in this
  repository). After 5 wrong attempts from one address, or 30 in total, sign-in
  is locked for 15 minutes.
- **Sign-in cookie**: HMAC-signed, HttpOnly, SameSite=Strict, Secure on HTTPS,
  7 days. Setting a new password invalidates every existing sign-in.
- **Requests** must be JSON from the site's own origin; other sites can't post.
- **Data files** (`data/`) are never served directly. They are read only
  through `api/library.php`, and each starts with a PHP line that outputs
  nothing if it is ever requested, in case the server rules were missing.
- **Only the site's own files can be fetched** (an `.htaccess` whitelist);
  everything else answers 403.
- **Strict Content Security Policy**: no inline scripts or styles, so nothing
  typed into a title or note can run as code; user text is never inserted as HTML.
- **No third parties for visitors**: fonts are self-hosted. Open Library is
  only contacted from the owner's browser while editing.
- **Not indexed**: `robots.txt`, a `noindex` tag and an `X-Robots-Tag` header.

## Not in this repository

- **`data/`**: the library itself (books, notes, private items, covers). The
  server creates it on the first save, so a fresh copy starts with an empty shelf.
- **`api/config.php`**: the password hash.
- **Images**: the site icons (`favicon.ico`, `icon-32.png`, `icon-192.png`,
  `apple-touch-icon.png`). The site works without them; browsers just show a
  default icon.

## Run it on your computer

Needs PHP 8.0 or newer.

```sh
git clone https://github.com/saeez/archive.git
cd archive
php api/setup.php          # choose a password (12+ characters)
php -S localhost:8000
```

Open <http://localhost:8000>. To sign in, open
<http://localhost:8000/#signin>: there is deliberately no sign-in button.
Once signed in, the pen icon adds books.

## Deploy

Any Apache host with PHP 8 and `.htaccess` support. HTTPS must be on.

1. Set the password with `php api/setup.php` (it writes `api/config.php`).
2. Build a folder with only what the server needs:

   ```sh
   rsync -a --exclude .git --exclude .gitignore --exclude README.md --exclude CLAUDE.md --exclude test.js --exclude LICENSE \
     --exclude api/setup.php --exclude 'fonts/*.txt' --exclude .DS_Store ./ ~/Desktop/archive-upload/
   ```

3. Upload the **contents** of `archive-upload` to the site's folder over an
   encrypted connection (SFTP or FTPS).
4. Check: the page loads; `/README.md`, `/data/library.php` and
   `/api/config.php` each answer **403**; `/#signin` works.

When updating later, leave out the `data` folder so the live library is never
overwritten. To back up, download `data/` from the server.

**On Simply.com**: Website → PHP Version (8.0+); Website → HTTPS Protection
(Let's Encrypt, Force HTTPS). Upload with Cyberduck or FileZilla using
"FTP-SSL (Explicit AUTH TLS)", server `ftp.simply.com`, port 21, and the
webhosting login from Administration → Login details (the username is the
domain name). A subdomain has its own folder at the top of the FTP space.

## Tests

```sh
node test.js
```

Runs the shelf, search, colour and formatting logic, then the real
`api/library.php` and `api/setup.php` against a throwaway copy: sign-in,
forged and expired cookies, the lockout, privacy of notes and private items,
covers, and that data files can't be read from the web. Needs PHP and Node 18+.

## License

The code is under the [MIT License](LICENSE): free to use, copy and change,
keeping the copyright notice. The fonts keep their own license (below).

## Credits

Fonts: [Cormorant Garamond](https://github.com/CatharsisFonts/Cormorant),
[Karla](https://github.com/googlefonts/karla) and
[Space Mono](https://github.com/googlefonts/spacemono), under the SIL Open
Font License (see `fonts/OFL-*.txt`). Book covers and years come from
[Open Library](https://openlibrary.org).
