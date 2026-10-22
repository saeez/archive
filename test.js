/* node test.js — the shelf logic from app.js, then api/library.php and
   api/setup.php for real (a throwaway copy served by `php -S`, so your own
   library and password are never touched). */

const fs = require("fs"), os = require("os"), path = require("path"), assert = require("assert"), crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

/* ---- app.js: everything above the DOM marker is plain logic ---- */
const src = fs.readFileSync(__dirname + "/app.js", "utf8");
const cut = src.indexOf("/* ---- DOM ---- */");
assert.ok(cut > 0, "DOM marker moved — update test.js");
const names = "spineWidth, arrange, genresOf, matches, words, hits, settle, inkFor, worst, dominant, yearText, linkHost, format, blocks, spans, plain, modulesOf, moduleTints, youtubeId, classMatches, placeClass, place, shareCode, weekOf";
const { spineWidth, arrange, genresOf, matches, words, hits, settle, inkFor, worst, dominant, yearText, linkHost, format, blocks, spans, plain, modulesOf, moduleTints, youtubeId, classMatches, placeClass, place, shareCode, weekOf } =
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
const CT3 = { course: "Critical Thinking", batch: "Batch 3" }, EI6 = { course: "Emotional Intelligence", batch: "Batch 6" };
assert.strictEqual(shareCode([CT3]), "CTB3", "a batch's link: the course's initials, B and its number");
assert.strictEqual(shareCode([{ course: "Critical Thinking", batch: "" }]), "CT", "a whole course: its initials");
assert.strictEqual(shareCode([CT3, EI6]), "CTB3EIB6", "several: one after another");
assert.strictEqual(shareCode([{ course: "قرآن فہمی", batch: "" }]), "", "no Latin initials, no suggestion");
assert.strictEqual(shareCode([CT3, { course: "قرآن فہمی", batch: "" }]), "", "not even in part");
assert.strictEqual(shareCode([CT3, EI6, CT3, EI6, CT3, EI6]), "", "nor past 20 letters (24 here)");
assert.strictEqual(shareCode([]), "");
const batchDates = ["2026-10-10", "2026-10-03", "", "2026-10-05"];   // the first class: Saturday 3 October
assert.strictEqual(weekOf("2026-10-03", batchDates), 1, "the first class is in week 1");
assert.strictEqual(weekOf("2026-10-04", batchDates), 1, "so is the Sunday after it");
assert.strictEqual(weekOf("2026-10-05", batchDates), 2, "a Monday starts week 2");
assert.strictEqual(weekOf("2026-12-28", batchDates), 14, "weeks carry on across months (Monday 28 December: 13 Mondays after 28 September)");
assert.strictEqual(weekOf("", batchDates), 0, "no date, no week");

/* class recordings */
assert.deepStrictEqual(modulesOf([{ module: "Cortisol", title: "a" }, { module: "Cortisol", title: "b" }, { module: "Oxytocin", title: "c" }, { module: "Cortisol", title: "d" }])
  .map(m => [m.name, m.classes.map(c => c.i + c.title)]), [["Cortisol", ["0a", "1b"]], ["Oxytocin", ["2c"]], ["Cortisol", ["3d"]]], "classes in a row with one module form a group");
assert.deepStrictEqual(modulesOf([{ title: "x" }]).map(m => m.name), [""], "a class without a module still shows");
assert.deepStrictEqual(moduleTints(["A", "B", "C", "D", "E", "F"].map(name => ({ name }))), [0, 1, 2, 3, 4, 0], "modules take the five tints in turn");
assert.deepStrictEqual(moduleTints(["A", "B", "A", "C"].map(name => ({ name }))), [0, 1, 0, 1], "a module used again keeps its tint; a new one never matches the group above it");
assert.strictEqual(youtubeId("https://youtu.be/Ju-Zem0r44c?si=abc"), "Ju-Zem0r44c");
assert.strictEqual(youtubeId("https://www.youtube.com/watch?v=Doxpyx6jEj0&t=30"), "Doxpyx6jEj0");
assert.strictEqual(youtubeId("https://youtube.com/live/Doxpyx6jEj0"), "Doxpyx6jEj0");
assert.strictEqual(youtubeId("https://evil.example/watch?v=Doxpyx6jEj0"), "", "only YouTube plays inside the page");
assert.strictEqual(youtubeId("https://youtube.com.evil.example/watch?v=Doxpyx6jEj0"), "");
assert.strictEqual(youtubeId("javascript:alert(1)//youtu.be/Doxpyx6jEj0"), "");
assert.strictEqual(youtubeId("https://youtu.be/short"), "", "a broken id is not played");
assert.ok(classMatches({ title: "Serotonin · Hierarchy of Dominance", module: "Serotonin" }, words("dominance SEROTONIN")), "class titles are searchable");
assert.ok(classMatches({ title: "Dopamine", tag: "Bonus · EI Batch 5" }, words("bonus dopamine")), "and their labels");
assert.ok(!classMatches({ title: "Cortisol" }, words("oxytocin")));
const ct = { name: "CT", batches: [{ name: "Batch 3", classes: [{ title: "a" }, { title: "b" }] }, { name: "Batch 5", classes: [{ title: "c" }] }] };
const shape = c => c.batches.map(b => b.name + ":" + b.classes.map(x => x.title).join(""));
assert.deepStrictEqual(shape(placeClass(ct, 1, -1, { title: "d" }, "Batch 5")), ["Batch 3:ab", "Batch 5:cd"], "a new class goes last in its batch");
assert.deepStrictEqual(shape(placeClass(ct, 0, 0, { title: "A" }, "Batch 3")), ["Batch 3:Ab", "Batch 5:c"], "a changed class keeps its place");
assert.deepStrictEqual(shape(placeClass(ct, 0, 1, { title: "b" }, "Batch 5")), ["Batch 3:a", "Batch 5:cb"], "or moves to another batch");
assert.deepStrictEqual(shape(placeClass(ct, 1, -1, { title: "z" }, "Batch 2")), ["Batch 2:z", "Batch 3:ab", "Batch 5:c"], "a new batch name makes a batch, in number order");
assert.deepStrictEqual(shape(placeClass(ct, 1, 0, null, "Batch 5")), ["Batch 3:ab"], "an emptied batch goes");
assert.deepStrictEqual(shape(placeClass({ batches: [{ name: "B1", classes: [{ title: "x" }] }] }, 0, 0, null, "B1")), ["B1:"], "unless it is the last");
assert.deepStrictEqual(shape(ct), ["Batch 3:ab", "Batch 5:c"], "the course itself is left as it was");
const waiting = { batches: [{ name: "Batch 2", classes: [] }, ...ct.batches] };
assert.deepStrictEqual(shape(placeClass(waiting, 2, -1, { title: "d" }, "Batch 5")), ["Batch 2:", "Batch 3:ab", "Batch 5:cd"], "a batch still waiting for its classes stays");
const lg = gs => gs.map(g => g.name + ":" + g.links.map(x => x.title).join(""));
assert.deepStrictEqual(lg(place([], "links", 0, -1, { title: "a" }, "Libraries")), ["Libraries:a"], "the first link makes its group");
assert.deepStrictEqual(lg(place([{ name: "", links: [{ title: "a" }] }], "links", 0, 0, null, "")), [":"], "a batch's last resource can go");
const kept = { batches: [{ name: "Batch 3", resources: [{ title: "lib" }], classes: [{ title: "a" }] }, { name: "Batch 5", classes: [{ title: "b" }] }] };
assert.deepStrictEqual(placeClass(kept, 0, 0, null, "Batch 3").batches.map(b => b.name), ["Batch 3", "Batch 5"], "a batch with resources stays when its last class goes");

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
    assert.deepStrictEqual(await r.json(), { owner: false, guest: false, items: [] });
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
    assert.doesNotMatch(raw, /expires|max-age/i, "and it ends when the browser closes");
    const me = cookieOf(r);

    /* the librarian's books, notes and private things */
    const book = {
      id: "aaaaaaaa-1", kind: "book", title: " Dune ", author: "Frank Herbert", genre: "Sci-fi, Classics", pages: 412,
      rating: 5, notes: "My notes <script>alert(1)</script> <?php echo 'x'; ?>", remarks: "Worth it.", link: "https://drive.google.com/file/d/abc/view", year: 1965, isbn: "978-0441172719",
      color: "#7a3b2a", private: false, reading: true, extra: "dropped", binding: "Paperback"
    };
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

    /* class recordings are for you alone */
    assert.deepStrictEqual((await (await get("?classes", me)).json()).courses, [], "no classes file yet: none");
    fs.writeFileSync(tmp + "/data/classes.php", GUARD + JSON.stringify([{ name: "Course", batches: [{ name: "Batch 1", classes: [{ title: "One", url: "https://youtu.be/secretvideo" }] }] }]));
    r = await get("?classes");
    assert.strictEqual(r.status, 404, "to visitors the class recordings do not exist");
    assert.strictEqual(await r.text(), "", "not even an error message");
    assert.ok(!JSON.stringify(await (await get()).json()).includes("secretvideo"), "and the public shelf never carries them");
    assert.strictEqual((await get("?classes", "archive_owner=9999999999.deadbeef")).status, 404, "a made-up cookie gets nothing");
    r = await fetch(site + "/data/classes.php");
    assert.ok(r.status === 404 && !(await r.text()).includes("secretvideo"), "the classes file itself shows nothing");
    assert.strictEqual((await (await get("?classes", me)).json()).courses[0].batches[0].classes[0].url, "https://youtu.be/secretvideo", "you get them");
    const gaza = { module: "Fallacies", title: "Gaza", url: "https://youtu.be/xAOSgkyhSVY", notes: "https://1drv.ms/x/abc", tag: "", date: "2026-02-01", evil: "<script>" };
    const course = (x = gaza, batch = { name: " Batch 5 " }) => ({ name: " قرآن فہمی ", teacher: " Mufti Kamran Shahzad ", extra: "dropped", batches: [{ ...batch, classes: [x] }] });
    assert.strictEqual((await post({ op: "classes", courses: [course()] })).status, 401, "visitors can't change the classes");
    r = await post({ op: "classes", courses: [course()] }, { cookie: me });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual((await r.json()).courses, [{ name: "قرآن فہمی", teacher: "Mufti Kamran Shahzad", batches: [{ name: "Batch 5", classes: [
      { module: "Fallacies", title: "Gaza", url: "https://youtu.be/xAOSgkyhSVY", notes: "https://1drv.ms/x/abc", date: "2026-02-01" }] }] }], "trimmed; unknown and empty fields dropped");
    assert.ok(fs.existsSync(tmp + "/data/classes.bak.php"), "the version before is kept");
    assert.ok(file("data/classes.php").startsWith(GUARD) && !file("data/classes.php").slice(GUARD.length).includes("<"), "the saved file can never read as PHP");
    for (const bad of [{ url: "javascript:alert(1)" }, { notes: "javascript:alert(1)" }, { title: "" }, { url: "" }, { date: "yesterday" }, { title: ["x"] }]) {
      r = await post({ op: "classes", courses: [course({ ...gaza, ...bad })] }, { cookie: me });
      assert.strictEqual(r.status, 400, "refused: " + JSON.stringify(bad));
    }
    assert.strictEqual((await post({ op: "classes", courses: [course(gaza, { name: "" })] }, { cookie: me })).status, 400, "every batch needs a name");
    assert.strictEqual((await post({ op: "classes", courses: [{ ...course(), teacher: ["x"] }] }, { cookie: me })).status, 400, "a teacher is a name");
    assert.strictEqual((await post({ op: "classes", courses: [{ name: "X", batches: "nope" }] }, { cookie: me })).status, 400);
    assert.strictEqual((await post({ op: "classes", courses: "nope" }, { cookie: me })).status, 400);
    assert.strictEqual((await (await get("?classes", me)).json()).courses[0].batches[0].classes[0].title, "Gaza", "a refused save changes nothing");
    r = await post({ op: "classes", courses: [{ ...course(gaza, { name: "Batch 5", resources: [{ title: " Drive ", url: "https://drive.google.com/x", extra: 1 }] }), resources: [{ title: "old", url: "https://a.b" }] }] }, { cookie: me });
    const saved = (await r.json()).courses[0];
    assert.deepStrictEqual(saved.batches[0].resources, [{ title: "Drive", url: "https://drive.google.com/x" }], "a batch keeps its resources, trimmed");
    assert.ok(!("resources" in saved), "resources belong to batches, not to the whole course");
    for (const bad of [{ title: "x", url: "javascript:alert(1)" }, { title: "", url: "https://a.b" }, "nope"]) {
      assert.strictEqual((await post({ op: "classes", courses: [course(gaza, { name: "Batch 5", resources: [bad] })] }, { cookie: me })).status, 400, "refused resource: " + JSON.stringify(bad));
    }

    /* the links page is yours alone too */
    assert.deepStrictEqual((await (await get("?links", me)).json()).groups, [], "no links file yet: none");
    const groups = [{ name: " Libraries ", links: [{ title: " CT-B3 ", url: "https://drive.google.com/secretfolder", extra: 1 }] }];
    assert.strictEqual((await post({ op: "links", groups })).status, 401, "visitors can't change the links");
    r = await post({ op: "links", groups }, { cookie: me });
    assert.deepStrictEqual((await r.json()).groups, [{ name: "Libraries", links: [{ title: "CT-B3", url: "https://drive.google.com/secretfolder" }] }], "trimmed; unknown fields dropped");
    r = await get("?links");
    assert.ok(r.status === 404 && (await r.text()) === "", "to visitors the links do not exist");
    r = await fetch(site + "/data/links.php");
    assert.ok(r.status === 404 && !(await r.text()).includes("secretfolder"), "the links file itself shows nothing");
    for (const bad of [[{ name: "G", links: [{ title: "x", url: "javascript:alert(1)" }] }], [{ name: ["G"], links: [] }], [{ name: "G" }], "nope"]) {
      assert.strictEqual((await post({ op: "links", groups: bad }, { cookie: me })).status, 400, "refused: " + JSON.stringify(bad));
    }
    assert.strictEqual((await (await get("?links", me)).json()).groups[0].links[0].title, "CT-B3", "a refused save changes nothing");

    /* shared links: a guest gets one course, or one batch of it, and nothing else */
    const throttled = fs.existsSync(tmp + "/data/throttle.php") ? file("data/throttle.php") : null;
    const unthrottle = () => throttled === null ? fs.rmSync(tmp + "/data/throttle.php", { force: true }) : fs.writeFileSync(tmp + "/data/throttle.php", throttled);
    await post({ op: "classes", courses: [
      { name: "Critical Thinking", batches: [{ name: "Batch 3", resources: [{ title: "B3 drive", url: "https://drive.google.com/b3" }], classes: [{ title: "Three", url: "https://youtu.be/batch3video" }] },
                                             { name: "Batch 5", classes: [{ title: "Five", url: "https://youtu.be/batch5video" }] }] },
      { name: "قرآن فہمی", batches: [{ name: "Batch 1", classes: [{ title: "Q", url: "https://youtu.be/quranvideo" }] }] },
    ] }, { cookie: me });
    const scope = (course, batch = "") => ({ course, batch }), CT3 = scope("Critical Thinking", "Batch 3");
    const share = (x, cookie = me) => post({ op: "share", scope: [CT3], code: "NEW", ...x }, { cookie });
    assert.strictEqual((await share({})).status, 200);
    await post({ op: "unshare", code: "NEW" }, { cookie: me });
    assert.strictEqual((await share({}, "")).status, 401, "visitors can't share");
    r = await share({ code: " ctb3 " });
    let sh = await r.json();
    const pwOf = (list, code) => list.find(x => x.code === code).password;
    const pw3 = pwOf(sh.shares, "CTB3");
    assert.match(pw3, /^[a-km-zA-HJ-NP-Z2-9]{4}-[a-km-zA-HJ-NP-Z2-9]{4}-[a-km-zA-HJ-NP-Z2-9]{4}$/, "no password given: the server makes one");
    assert.deepStrictEqual(sh.shares.map(x => [x.code, x.scope]), [["CTB3", [CT3]]], "codes are kept in capitals");
    assert.ok(!("hash" in sh.shares[0]) && !("sealed" in sh.shares[0]), "the hash and the sealed copy never leave the server");
    assert.ok(file("data/shares.php").startsWith(GUARD) && !file("data/shares.php").includes(pw3), "the password isn't in the file as written, and it's behind the guard");
    const pwCT = pwOf((await (await share({ code: "CT", scope: [scope("Critical Thinking")], password: "  my own words  " })).json()).shares, "CT");
    assert.strictEqual(pwCT, "my own words", "or you choose it (trimmed)");
    for (const [bad, why] of [
      [{ code: "ctb3" }, "a code is shared once"], [{ code: "signin" }, "your own door is not a code"], [{ code: "Courses" }, "nor is #courses"],
      [{ code: "Dashboard" }, "nor #dashboard"], [{ password: "short" }, "a chosen password has 6 characters or more"], [{ password: 123456 }, "a password is text"],
      [{ code: "C" }, "codes are 2 to 20 letters and digits"], [{ code: "CT-3" }, "letters and digits only"], [{ code: ["CT9"] }, "a code is text"],
      [{ scope: [scope("Nope")] }, "only real courses"], [{ scope: [scope("Critical Thinking", "Batch 9")] }, "and real batches"],
      [{ scope: [CT3, scope("Nope")] }, "every one of them"], [{ scope: [{ course: ["Critical Thinking"] }] }, "a course is a name"],
      [{ scope: [] }, "a link opens something"], [{ scope: "Critical Thinking" }, "a scope is a list"], [{ scope: null }, "and is needed"],
    ]) assert.strictEqual((await share(bad)).status, 400, why);
    assert.strictEqual((await get("?shares")).status, 404, "to visitors the shares do not exist");
    sh = await (await get("?shares", me)).json();
    assert.deepStrictEqual(sh.shares.map(x => [x.code, x.password]), [["CTB3", pw3], ["CT", "my own words"]], "the dashboard shows each link's password");

    assert.strictEqual((await post({ op: "guest", code: "CTB3", password: "wrong-pass-word" })).status, 401, "a wrong password opens nothing");
    assert.strictEqual((await post({ op: "guest", code: "NOSUCH", password: pw3 })).status, 401, "nor does a code that isn't shared");
    assert.strictEqual((await post({ op: "guest", code: "CT", password: pw3 })).status, 401, "a password opens only its own link");
    r = await post({ op: "guest", code: "ctb3", password: ` ${pw3} ` });
    assert.strictEqual(r.status, 200);
    const graw = r.headers.getSetCookie()[0], g3 = cookieOf(r);
    assert.match(graw, /^archive_guest=/);
    assert.match(graw, /HttpOnly/i);
    assert.match(graw, /SameSite=Strict/i);
    assert.doesNotMatch(graw, /expires|max-age/i, "a guest's sign-in ends with the browser too");
    assert.deepStrictEqual([(sh = await r.json()).owner, sh.guest], [false, true]);
    let seen = await (await get("?classes", g3)).json();
    assert.deepStrictEqual(seen.courses.map(c => [c.name, c.batches.map(b => b.name)]), [["Critical Thinking", ["Batch 3"]]], "a batch's guest sees that batch, with its resources");
    assert.strictEqual(seen.courses[0].batches[0].resources[0].title, "B3 drive");
    assert.ok(seen.owner === false && !JSON.stringify(seen).includes("batch5video") && !JSON.stringify(seen).includes("quranvideo"), "and nothing else");
    sh = await (await get("", g3)).json();
    assert.ok(sh.guest && !sh.owner && !sh.items.some(i => i.private || "notes" in i), "elsewhere a guest is a visitor");
    assert.strictEqual((await get("?links", g3)).status, 404, "no links");
    assert.strictEqual((await get("?shares", g3)).status, 404, "no shares");
    assert.strictEqual((await get("?cover=cccccccc-3", g3)).status, 404, "no private covers");
    for (const body of [{ op: "classes", courses: [] }, { op: "links", groups: [] }, { op: "put", item: book }, { op: "share", scope: [scope("Critical Thinking")], code: "MINE" }, { op: "unshare", code: "CT" }, { op: "repass", code: "CT", password: "mine123" }]) {
      assert.strictEqual((await post(body, { cookie: g3 })).status, 401, "a guest changes nothing: " + body.op);
    }
    let gCT = cookieOf(await post({ op: "guest", code: "CT", password: pwCT }));
    sh = await (await get("?shares", me)).json();
    assert.deepStrictEqual(sh.opens.map(o => o.code), ["CTB3", "CT"], "each time a link lets someone in, the dashboard has it");
    assert.ok(sh.opens.every(o => Math.abs(o.at - Date.now() / 1000) < 60), "with the time");
    const DAY = 86400, t0 = Math.floor(Date.now() / 1000);
    fs.writeFileSync(tmp + "/data/opens.php", GUARD + JSON.stringify([{ at: t0 - 91 * DAY, code: "OLD" }, { at: t0 - 89 * DAY, code: "CT" }, ...sh.opens]));
    assert.deepStrictEqual((await (await get("?shares", me)).json()).opens.map(o => o.code), ["CT", "CTB3", "CT"], "after 90 days an entry goes");
    assert.ok(!file("data/opens.php").includes("OLD"), "from the file too");

    /* a new password: chosen or made; the guests who used the old one are out */
    unthrottle();   // the wrong tries above would otherwise lock this address out
    assert.strictEqual((await post({ op: "repass", code: "NOSUCH", password: "whatever1" }, { cookie: me })).status, 400, "only a shared link gets a new password");
    assert.strictEqual((await post({ op: "repass", code: "CT", password: "abc" }, { cookie: me })).status, 400, "6 characters or more");
    sh = await (await post({ op: "repass", code: "ct", password: "a new phrase" }, { cookie: me })).json();
    assert.strictEqual(pwOf(sh.shares, "CT"), "a new phrase");
    assert.strictEqual((await get("?classes", gCT)).status, 404, "a new password signs that link's guests out");
    assert.strictEqual((await post({ op: "guest", code: "CT", password: pwCT })).status, 401, "the old password no longer works");
    const gCT2 = cookieOf(await post({ op: "guest", code: "CT", password: "a new phrase" }));
    assert.strictEqual((await get("?classes", gCT2)).status, 200, "the new one does");
    const pwMade = pwOf((await (await post({ op: "repass", code: "CT", password: "" }, { cookie: me })).json()).shares, "CT");
    assert.match(pwMade, /^\S{4}-\S{4}-\S{4}$/, "an empty one: the server makes one");
    gCT = cookieOf(await post({ op: "guest", code: "CT", password: pwMade }));
    assert.deepStrictEqual((await (await get("?classes", gCT)).json()).courses.map(c => c.batches.map(b => b.name)), [["Batch 3", "Batch 5"]], "a course's guest sees every batch");
    assert.strictEqual((await get("?classes", g3.replace(/\.\d+\./, ".9999999999."))).status, 404, "a guest's cookie can't be stretched");
    assert.strictEqual((await get("?classes", "archive_guest=CT.9999999999." + "0".repeat(64))).status, 404, "or made up");

    /* deleting a link ends its guests' access at once; the code made again needs the new password */
    sh = await (await post({ op: "unshare", code: "ctb3" }, { cookie: me })).json();
    assert.deepStrictEqual(sh.shares.map(x => x.code), ["CT"]);
    assert.strictEqual((await get("?classes", g3)).status, 404, "a deleted link opens nothing, even for someone already in");
    assert.strictEqual((await get("?classes", gCT)).status, 200, "the other links keep working");
    const pwNew = pwOf((await (await share({ code: "CTB3" })).json()).shares, "CTB3");
    assert.notStrictEqual(pwNew, pw3);
    assert.strictEqual((await get("?classes", g3)).status, 404, "the old sign-in doesn't come back with the code");
    r = await post({ op: "logout" }, { cookie: gCT });
    assert.ok(r.headers.getSetCookie().some(c => /^archive_guest=(deleted)?;/.test(c)), "signing out clears a guest too");

    /* one link, several courses: whole ones, and batches of others */
    sh = await (await share({ code: "MIX", scope: [scope("Critical Thinking", "Batch 5"), scope("قرآن فہمی"), scope("Critical Thinking", "Batch 5")], password: "mixed bag" })).json();
    assert.deepStrictEqual(sh.shares.find(x => x.code === "MIX").scope, [scope("Critical Thinking", "Batch 5"), scope("قرآن فہمی")], "each course or batch once");
    const gMix = cookieOf(await post({ op: "guest", code: "MIX", password: "mixed bag" }));
    seen = await (await get("?classes", gMix)).json();
    assert.deepStrictEqual(seen.courses.map(c => [c.name, c.batches.map(b => b.name)]), [["Critical Thinking", ["Batch 5"]], ["قرآن فہمی", ["Batch 1"]]], "its guest sees exactly those");
    assert.ok(!JSON.stringify(seen).includes("batch3video") && !JSON.stringify(seen).includes("B3 drive"), "and not the batch left out");

    /* a link made before links could open several courses still works */
    const oldHash = spawnSync("php", ["-r", "echo password_hash('old style', PASSWORD_DEFAULT);"], { encoding: "utf8" }).stdout;
    const kept = JSON.parse(file("data/shares.php").slice(GUARD.length));
    fs.writeFileSync(tmp + "/data/shares.php", GUARD + JSON.stringify([...kept, { code: "OLD", course: "Critical Thinking", batch: "Batch 3", hash: oldHash, added: "2026-10-22" }]));
    const gOld = cookieOf(await post({ op: "guest", code: "OLD", password: "old style" }));
    assert.deepStrictEqual((await (await get("?classes", gOld)).json()).courses.map(c => c.batches.map(b => b.name)), [["Batch 3"]], "it opens what it did");
    assert.deepStrictEqual((await (await get("?shares", me)).json()).shares.find(x => x.code === "OLD").scope, [CT3], "and the dashboard reads it like the others");
    unthrottle();   // the lockout test below counts from before these wrong tries

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
