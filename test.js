/* node test.js — the shelf logic from app.js, then api/library.php and
   api/setup.php for real (a throwaway copy served by `php -S`, so your own
   library and password are never touched). */

const fs = require("fs"), os = require("os"), path = require("path"), assert = require("assert"), crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

/* ---- app.js: everything above the DOM marker is plain logic ---- */
const src = fs.readFileSync(__dirname + "/app.js", "utf8");
const cut = src.indexOf("/* ---- DOM ---- */");
assert.ok(cut > 0, "DOM marker moved — update test.js");
const names = "spineWidth, arrange, genresOf, matches, words, hits, settle, inkFor, worst, dominant, yearText, linkHost, format, blocks, spans, plain";
const { spineWidth, arrange, genresOf, matches, words, hits, settle, inkFor, worst, dominant, yearText, linkHost, format, blocks, spans, plain } =
  new Function(src.slice(0, cut) + `\nreturn { ${names} };`)();

/* spines */
assert.strictEqual(spineWidth(1), 16, "thin pamphlets still get a readable spine");
assert.strictEqual(spineWidth(5000), 92, "doorstops are capped");
assert.ok(spineWidth(400) > spineWidth(200), "more pages, thicker book");
for (const c of ["#ffffff", "#000000", "#808080", "#c20257", "#dabd8e", "#424962", "#7f7f00"]) {
  const bg = settle(c);
  assert.ok(worst(bg, inkFor(bg)) >= 4.5, `spine lettering stays readable on ${c} (got ${bg})`);
}
const px = (rgb, n) => Array.from({ length: n }, () => [...rgb, 255]).flat();
assert.strictEqual(dominant([...px([200, 30, 30], 30), ...px([240, 240, 240], 40)]), "#c81e1e", "a coloured area outweighs a slightly larger grey one");
assert.strictEqual(yearText(-375), "375 BC");
assert.strictEqual(yearText(1866), "1866");
assert.strictEqual(yearText(null), "");
assert.strictEqual(linkHost("https://www.gutenberg.org/ebooks/2600"), "gutenberg.org", "a reading link shows its site");
assert.strictEqual(linkHost("javascript:alert(1)"), "", "and only web addresses ever become links");
assert.strictEqual(linkHost("drive.google.com/file/d/x"), "");

/* genres: two at once are two genres, never a new combined one */
assert.deepStrictEqual(genresOf({ genre: "Philosophy & religion" }), ["Philosophy", "Religion"]);
assert.deepStrictEqual(genresOf({ genre: " poetry / Sufism; history,," }), ["Poetry", "Sufism", "History"]);
assert.deepStrictEqual(genresOf({ genre: "" }), []);

/* the shelf's order */
const b = (title, author, genre) => ({ kind: "book", title, author, genre, pages: 100 });
const g = arrange([
  b("The Idiot", "Fyodor Dostoevsky", "Fiction"),
  { kind: "scroll", title: "My essay", genre: "Philosophy", text: "On walking" },
  b("Meditations", "Marcus Aurelius", "Philosophy & Stoicism"),
  b("The Stranger", "Albert Camus", " fiction , Classics"),
  b("Loose notes", "", ""),
]);
assert.deepStrictEqual(g.map(x => x.name), ["Fiction", "Philosophy", "Unsorted"], "first genres A–Z, case-insensitive, Unsorted last");
assert.deepStrictEqual(g[0].items.map(x => x.title), ["The Stranger", "The Idiot"], "shelved by author surname");
assert.deepStrictEqual(g[1].items.map(x => x.kind), ["book", "scroll"], "scrolls stand after the books of their genre");

/* search */
const muq = { title: "The Muqaddimah", author: "Ibn Khaldun", genre: "History", notes: "Asabiyyah: why **dynasties** rise and fall in about four generations.", year: 1377 };
assert.ok(matches(muq, words("dynasties generations")), "words from notes, not next to each other");
assert.ok(matches(muq, words("  GENERATIONS khaldun ")), "any case, any order, across fields");
assert.ok(matches(muq, words("1377")), "the year is searchable");
assert.ok(!matches(muq, words("dynasties empires")), "every word must be there");
assert.ok(matches({ title: "One Hundred Years", author: "Gabriel García Márquez" }, words("marquez garcia")), "accents ignored");
assert.ok(matches(muq, []), "an empty search shows everything");
const name = "Gabriel García Márquez";
assert.deepStrictEqual(hits(name, words("marquez garcia")).map(([a, e]) => name.slice(a, e)), ["García", "Márquez"], "marks the words as written");
assert.deepStrictEqual(hits("rise and rise", words("rise ris")), [[0, 4], [9, 13]], "overlapping finds merge");

/* formatting toolbar: what each button does to the text, and doing it twice undoes it */
const run = (v, s, e, kind) => { const r = format(v, s, e, kind); return v.slice(0, r.from) + r.insert + v.slice(r.to); };
assert.strictEqual(run("a word here", 2, 6, "bold"), "a **word** here");
assert.strictEqual(run("a **word** here", 4, 8, "bold"), "a word here", "bold toggles off");
assert.strictEqual(run("a word", 2, 6, "italic"), "a _word_");
assert.strictEqual(run("one\ntwo\nthree", 1, 6, "bullet"), "- one\n- two\nthree", "every touched line becomes an item");
assert.strictEqual(run("- one\n- two", 0, 11, "bullet"), "one\ntwo", "and back");
assert.strictEqual(run("- one\n- two", 0, 11, "number"), "1. one\n2. two", "bullets switch to numbers");
assert.strictEqual(run("Title", 2, 2, "heading"), "## Title", "a caret alone formats its line");
assert.strictEqual(run("said", 0, 4, "quote"), "> said");
assert.deepStrictEqual(format("ab", 1, 1, "bold").sel, [3, 3], "an empty bold puts the caret between the marks");
assert.deepStrictEqual(blocks("## Lectures\nfirst line\nsecond line\n\n- a\n- b\n1. c\n> quoted"), [
  { type: "h", lines: ["Lectures"] }, { type: "p", lines: ["first line", "second line"] },
  { type: "ul", lines: ["a", "b"] }, { type: "ol", lines: ["c"] }, { type: "quote", lines: ["quoted"] },
]);
assert.deepStrictEqual(spans("a **bold** and _soft_ word"), [
  { t: "", text: "a " }, { t: "b", text: "bold" }, { t: "", text: " and " }, { t: "i", text: "soft" }, { t: "", text: " word" },
]);
assert.deepStrictEqual(spans("snake_case_name"), [{ t: "", text: "snake_case_name" }], "underscores inside words are left alone");
assert.strictEqual(plain("## Big\n- **one**\n- _two_"), "Big one two", "the hover card shows notes without marks");

/* ---- the server ---- */

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDn6KKKxPTP/9k=";
const GUARD = "<?php http_response_code(404); exit; ?>\n";
const PW = "correct horse battery staple", PW2 = "a whole new password ✓";

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "archive-"));
  fs.mkdirSync(tmp + "/api");
  for (const f of ["library.php", "setup.php"]) fs.copyFileSync(`${__dirname}/api/${f}`, `${tmp}/api/${f}`);
  const setup = input => spawnSync("php", [tmp + "/api/setup.php"], { input, encoding: "utf8" });
  const config = () => {
    const t = fs.readFileSync(tmp + "/api/config.php", "utf8");
    return { ...JSON.parse(t.slice(GUARD.length)), text: t };
  };
  const port = 8100 + Math.floor(Math.random() * 800);
  const php = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", tmp], { stdio: "ignore" });
  const site = `http://127.0.0.1:${port}`, url = site + "/api/library.php";
  const get = (q = "", cookie = "") => fetch(url + q, { headers: cookie ? { Cookie: cookie } : {} });
  const post = (body, { cookie = "", origin = site, type = "application/json" } = {}) =>
    fetch(url, { method: "POST", headers: { "Content-Type": type, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const cookieOf = r => (r.headers.getSetCookie()[0] || "").split(";")[0];
  const file = f => fs.readFileSync(`${tmp}/${f}`, "utf8");

  try {
    for (let i = 0; ; i++) {
      try { await fetch(url); break; } catch { if (i > 50) throw new Error("php -S did not start"); await new Promise(r => setTimeout(r, 100)); }
    }

    /* setting the password */
    assert.strictEqual((await post({ op: "login", password: PW })).status, 503, "no password set yet: sign-in is closed");
    assert.notStrictEqual(setup("short\nshort\n").status, 0, "a short password is refused");
    assert.notStrictEqual(setup(`${PW}\nsomething else\n`).status, 0, "two different entries are refused");
    assert.ok(!fs.existsSync(tmp + "/api/config.php"));
    assert.strictEqual(setup(`${PW}\n${PW}\n`).status, 0);
    const cfg = config();
    assert.ok(!cfg.text.includes(PW), "the password itself is never written down");
    assert.match(cfg.hash, /^\$2y\$12\$/, "only a bcrypt hash of it");

    /* a visitor */
    let r = await get();
    assert.deepStrictEqual(await r.json(), { owner: false, items: [] });
    assert.strictEqual(r.headers.get("cache-control"), "no-store", "what you see signed in is never cached for someone else");
    assert.strictEqual((await post({ op: "put", item: { id: "aaaaaaaa-1", kind: "book", title: "X", pages: 1 } })).status, 401, "visitors can't change anything");

    /* signing in */
    r = await post({ op: "login", password: "guess" });
    assert.strictEqual(r.status, 401);
    assert.strictEqual(r.headers.getSetCookie().length, 0, "no cookie for a wrong password");
    r = await post({ op: "login", password: PW });
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await r.json()).owner, true);
    const raw = r.headers.getSetCookie()[0];
    assert.match(raw, /HttpOnly/i, "page scripts can't read the sign-in cookie");
    assert.match(raw, /SameSite=Strict/i, "other sites can't send it");
    const me = cookieOf(r);

    /* the librarian's books, notes and private things */
    const book = { id: "aaaaaaaa-1", kind: "book", title: " Dune ", author: "Frank Herbert", genre: "Sci-fi, Classics", pages: 412,
                   rating: 5, notes: "My notes <script>alert(1)</script> <?php echo 'x'; ?>", remarks: "Worth it.", link: "https://drive.google.com/file/d/abc/view", year: 1965, isbn: "978-0441172719",
                   color: "#7a3b2a", private: false, reading: true, extra: "dropped", binding: "Paperback" };
    r = await post({ op: "put", item: { ...book, coverData: JPEG } }, { cookie: me });
    assert.strictEqual(r.status, 200);
    let lib = (await r.json()).items;
    assert.strictEqual(lib[0].title, "Dune", "trimmed");
    assert.strictEqual(lib[0].extra, undefined, "unknown fields are not stored");
    assert.strictEqual(lib[0].binding, undefined, "binding is no longer kept");
    assert.match(lib[0].cover, /^api\/library\.php\?cover=aaaaaaaa-1&v=[0-9a-f]+$/, "covers are served by the server, not straight from disk");
    const coverUrl = lib[0].cover;
    await post({ op: "put", item: { id: "bbbbbbbb-2", kind: "scroll", title: "Diary", text: "Very personal.", notes: "n", private: true } }, { cookie: me });
    await post({ op: "put", item: { id: "cccccccc-3", kind: "book", title: "Secret", pages: 9, private: true, coverData: JPEG } }, { cookie: me });

    lib = (await (await get("", me)).json()).items;
    assert.deepStrictEqual(lib.map(i => [i.id, !!i.private, !!i.notes]), [["aaaaaaaa-1", false, true], ["bbbbbbbb-2", true, true], ["cccccccc-3", true, false]],
      "signed in, you see everything");
    const pub = await (await get()).json();
    assert.strictEqual(pub.owner, false);
    assert.deepStrictEqual(pub.items.map(i => i.id), ["aaaaaaaa-1"], "visitors never get private items");
    assert.ok(!("notes" in pub.items[0]) && !("private" in pub.items[0]), "or anyone's notes");
    assert.strictEqual(pub.items[0].reading, true, "visitors do see what you are reading");
    assert.strictEqual(pub.items[0].remarks, "Worth it.", "remarks are public");
    assert.strictEqual(pub.items[0].link, book.link, "so is the reading link");
    assert.ok(!JSON.stringify(pub).includes("Very personal") && !JSON.stringify(pub).includes("Secret"));

    /* covers */
    r = await get("?cover=aaaaaaaa-1");
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.headers.get("content-type"), "image/jpeg");
    assert.strictEqual((await get("?cover=cccccccc-3")).status, 404, "a private book's cover is hidden from visitors");
    assert.strictEqual((await get("?cover=cccccccc-3", me)).status, 200, "but not from you");
    assert.strictEqual((await get("?cover=../../api/config")).status, 404, "only real ids are looked up");

    /* data files can't be read from the web, even if the server rules were missing */
    const stored = file("data/library.php");
    assert.ok(stored.startsWith(GUARD), "every data file starts with the guard line");
    assert.ok(!stored.slice(GUARD.length).includes("<"), "and nothing after it can ever read as PHP or HTML");
    r = await fetch(site + "/data/library.php");
    assert.strictEqual(r.status, 404);
    assert.strictEqual(await r.text(), "", "requesting the library file directly shows nothing");
    r = await fetch(site + "/api/config.php");
    assert.ok(!(await r.text()).includes(cfg.hash), "the password hash is never shown");
    assert.strictEqual((await fetch(site + "/api/setup.php")).status, 404, "setup only runs on your own computer");

    /* forged, expired and stale sign-ins */
    const forge = (until, hash = cfg.hash, secret = cfg.secret) =>
      `archive_owner=${until}.${crypto.createHmac("sha256", secret).update(`owner|${until}|${hash}`).digest("hex")}`;
    const now = Math.floor(Date.now() / 1000);
    const edit = cookie => post({ op: "put", item: { ...book, cover: coverUrl, title: "Changed" } }, { cookie });
    assert.strictEqual((await edit(forge(now + 3600))).status, 200, "(the test signs cookies the way the server does)");
    assert.strictEqual((await edit(forge(now - 1))).status, 401, "an expired sign-in is refused");
    assert.strictEqual((await edit(forge(now + 3600, cfg.hash, "0".repeat(64)))).status, 401, "a cookie signed with a guessed key is refused");
    assert.strictEqual((await edit("archive_owner=9999999999.deadbeef")).status, 401, "a made-up cookie is refused");

    /* other sites and other ways in */
    assert.strictEqual((await post({ op: "put", item: book }, { cookie: me, origin: "https://evil.example" })).status, 403, "another site can't post here");
    assert.strictEqual((await post({ op: "put", item: book }, { cookie: me, type: "text/plain" })).status, 415, "a plain form can't either");
    assert.strictEqual((await fetch(url, { method: "DELETE", headers: { Cookie: me } })).status, 405);

    /* checking what's saved */
    for (const [bad, why] of [
      [{ pages: 0 }, "a book needs pages"], [{ title: "  " }, "a book needs a title"], [{ rating: 6 }, "ratings go to 5"],
      [{ id: "../../etc" }, "ids are checked"], [{ year: 1.5 }, "years are whole"], [{ color: "red; x" }, "colours are #rrggbb"],
      [{ isbn: "<b>" }, "ISBNs are digits"], [{ private: "yes" }, "private is true or false"], [{ reading: 1 }, "so is reading"],
      [{ link: "javascript:alert(1)" }, "links are web addresses"], [{ link: "drive.google.com/x" }, "with https://"],
      [{ coverData: "data:image/png;base64,iVBORw0KGgo=" }, "covers must be JPEG"],
      [{ coverData: "data:image/jpeg;base64,/9j/notreallyajpeg" }, "and really be one"],
    ]) assert.strictEqual((await post({ op: "put", item: { ...book, ...bad } }, { cookie: me })).status, 400, why);

    lib = (await (await post({ op: "put", item: { ...book, cover: coverUrl, notes: "Read it twice." } }, { cookie: me })).json()).items;
    assert.strictEqual(lib[0].cover, coverUrl, "an edit keeps the cover");
    lib = (await (await post({ op: "put", item: { ...book, cover: "https://evil.example/x.jpg" } }, { cookie: me })).json()).items;
    assert.strictEqual(lib[0].cover, coverUrl, "a cover can't be pointed anywhere else; any value just keeps it");
    lib = (await (await post({ op: "put", item: { ...book, cover: "" } }, { cookie: me })).json()).items;
    assert.strictEqual(lib[0].cover, "");
    assert.ok(!fs.existsSync(`${tmp}/data/covers/aaaaaaaa-1.jpg`), "a removed cover's file is deleted");
    await post({ op: "delete", id: "cccccccc-3" }, { cookie: me });
    assert.ok(!fs.existsSync(`${tmp}/data/covers/cccccccc-3.jpg`), "a removed book takes its cover with it");
    const store = JSON.parse(file("data/library.php").slice(GUARD.length));
    lib = (await (await get("", me)).json()).items;
    assert.deepStrictEqual(store.map(i => i.id), lib.map(i => i.id), "what's on disk is what came back");
    assert.ok(file("data/library.bak.php").startsWith(GUARD), "the previous version is kept, guarded too");

    store[0].added = "2001-01-01";
    fs.writeFileSync(`${tmp}/data/library.php`, GUARD + JSON.stringify(store));
    lib = (await (await post({ op: "put", item: { id: "dddddddd-4", kind: "book", title: "New", pages: 5 } }, { cookie: me })).json()).items;
    assert.notStrictEqual(lib.at(-1).added, "2001-01-01", "a new book is shelved today, not on the first book's date");

    /* signing out, and a new password signs everyone out */
    r = await post({ op: "logout" }, { cookie: me });
    assert.strictEqual((await r.json()).owner, false);
    assert.match(r.headers.getSetCookie()[0], /archive_owner=(deleted)?;/, "the cookie is cleared");
    assert.strictEqual(setup(`${PW2}\n${PW2}\n`).status, 0);
    assert.strictEqual((await edit(me)).status, 401, "after a new password, old sign-ins stop working");
    assert.strictEqual((await post({ op: "login", password: PW2 })).status, 200, "the new one works");

    /* a damaged library is never overwritten, and visitors learn nothing about it */
    fs.writeFileSync(`${tmp}/data/library.php`, GUARD + "{broken");
    r = await get();
    assert.strictEqual(r.status, 500);
    assert.ok(!(await r.text()).includes("library"), "no file names for visitors");
    const me2 = cookieOf(await post({ op: "login", password: PW2 }));
    assert.strictEqual((await post({ op: "delete", id: "dddddddd-4" }, { cookie: me2 })).status, 500);
    assert.strictEqual(file("data/library.php"), GUARD + "{broken");
    fs.writeFileSync(`${tmp}/data/library.php`, GUARD + "[]");

    /* guessing the password: 5 wrong tries close sign-in for 15 minutes */
    for (let i = 0; i < 4; i++) assert.strictEqual((await post({ op: "login", password: "nope" + i })).status, 401);   // + the "guess" above = 5
    assert.strictEqual((await post({ op: "login", password: "nope" })).status, 429, "after five wrong passwords, sign-in is locked");
    assert.strictEqual((await post({ op: "login", password: PW2 })).status, 429, "even the right one, until the lock ages out");
    assert.ok(file("data/throttle.php").startsWith(GUARD) && !file("data/throttle.php").includes("127.0.0.1"), "addresses are kept only as hashes");

    console.log("all good");
  } finally {
    php.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });
