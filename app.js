/* Saeed's Archive — one endless shelf. Books are 3D boxes with their real cover
   and a spine coloured from it; writings stand among them as scrolls.
   Changes are saved by api/library.php. */
"use strict";

const RAIL_H = 240;               // a typical book's height on the shelf, px
const PX_PER_PAGE = 0.075;        // spine thickness per page: tune if books look too fat or thin
const MIN_SPINE = 16, MAX_SPINE = 92;
const DRIFT = 16;                 // px per second the shelf floats by on its own
const CREAM = "#f7f0e3", INK = "#2a1d14";
const FALLBACK = ["#6b2a2a", "#2f4a63", "#3e5a3c", "#7a4e26", "#5b3a5e", "#2e2a26",
                  "#7d6531", "#6d3b25", "#2d5656", "#4a4a6a", "#8c4a3a", "#55613a"];

const spineWidth = pages => Math.round(Math.min(MAX_SPINE, Math.max(MIN_SPINE, 12 + pages * PX_PER_PAGE)));
const hash = s => { let h = 0; for (const ch of s) h = (Math.imul(h, 31) + ch.codePointAt(0)) >>> 0; return h; };
const lastName = a => (a || "").trim().split(/\s+/).pop();
const byAuthor = (a, b) => lastName(a.author).toLowerCase().localeCompare(lastName(b.author).toLowerCase()) || a.title.localeCompare(b.title);
const count = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
/* A book can have several genres: "Philosophy, Religion", "Mystery & Thriller"
   and "Poetry / Sufism" each mean two, and the book shows under both pills. */
const genresOf = it => (it.genre || "").split(/[,&/;]/).map(g => g.trim()).filter(Boolean).map(g => g[0].toUpperCase() + g.slice(1));
const yearText = y => y == null ? "" : y < 0 ? `${-y} BC` : String(y);
/* Where a book's reading link goes, shown as its site ("drive.google.com");
   "" unless it is a real http(s) address, so javascript: links never render. */
const linkHost = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.hostname.replace(/^www\./, "") : ""; } catch { return ""; } };

/* The shelf runs genre by genre: A–Z by each item's first genre, Unsorted
   last. Within a genre, books stand by author surname, then scrolls follow
   in the order they were written. */
function arrange(items) {
  const map = new Map();
  for (const it of items) {
    const name = genresOf(it)[0] || "Unsorted", key = name.toLowerCase();
    if (!map.has(key)) map.set(key, { key, name, items: [] });
    map.get(key).items.push(it);
  }
  for (const g of map.values()) {
    g.items.sort((a, b) => (a.kind === "scroll") - (b.kind === "scroll") || (a.kind === "book" && b.kind === "book" ? byAuthor(a, b) : 0));
  }
  return [...map.values()].sort((a, b) => (a.key === "unsorted") - (b.key === "unsorted") || a.name.localeCompare(b.name));
}

/* Search ignores case and accents ("marquez" finds "Márquez"). Every word
   typed must appear somewhere in the book or scroll, in any order. */
const fold = s => (s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const words = q => fold(q).split(/\s+/).filter(Boolean);
const matches = (it, ws) => {
  const hay = fold([it.title, it.author, it.genre, it.remarks, it.notes, it.text, yearText(it.year)].join("\n"));
  return ws.every(w => hay.includes(w));
};

/* Where the words occur in `text`, as merged [start, end) ranges of the
   original string, so they can be marked without changing what you wrote. */
function hits(text, ws) {
  let folded = "";
  const at = [];                       // at[i] = index in text of folded[i]
  for (let i = 0; i < text.length;) {
    const ch = String.fromCodePoint(text.codePointAt(i)), f = fold(ch);
    folded += f;
    for (let k = 0; k < f.length; k++) at.push(i);
    i += ch.length;
  }
  at.push(text.length);
  const found = [];
  for (const w of ws) {
    for (let j = folded.indexOf(w); j >= 0; j = folded.indexOf(w, j + 1)) {
      if (at[j + w.length] > at[j]) found.push([at[j], at[j + w.length]]);
    }
  }
  found.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of found) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e); else merged.push([s, e]);
  }
  return merged;
}

/* Font size and line count for a spine title at shelf scale: one line if it
   fits, two on a wider spine. `room` is the spine length free for it, px. */
function spineFont(title, w, room) {
  const one = room / (title.length * .5);          // ~0.5em per character
  if (one >= 10.5 || w < 30) return [Math.max(9, Math.min(13, w * .32, one)), 1];
  return [Math.max(9, Math.min(12, (w - 12) / 2.3, 2 * one)), 2];
}

/* ---- colour ---- */

const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hexOf = c => "#" + c.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => { const q = rgbOf(b); return hexOf(rgbOf(a).map((x, i) => x + (q[i] - x) * t)); };
const lum = h => {
  const [r, g, b] = rgbOf(h).map(x => (x /= 255) <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };

/* A spine's lighting runs from 12% lighter to 30% darker than its colour, and
   its lettering has to read across all of it (4.5:1). */
const worst = (bg, ink) => Math.min(contrast(mix(bg, "#ffffff", .12), ink), contrast(mix(bg, "#000000", .3), ink));
const inkFor = bg => worst(bg, CREAM) >= worst(bg, INK) ? CREAM : INK;
function settle(bg) {
  for (let i = 0; i < 40 && worst(bg, inkFor(bg)) < 4.5; i++) bg = mix(bg, inkFor(bg) === CREAM ? "#000000" : "#ffffff", .06);
  return bg;
}

/* The most prominent colour of a cover (RGBA pixels), favouring colourful
   areas over grey ones. */
function dominant(px) {
  const bins = new Map();
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const k = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    const w = .15 + (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    const s = bins.get(k) || [0, 0, 0, 0];
    s[0] += w; s[1] += r * w; s[2] += g * w; s[3] += b * w;
    bins.set(k, s);
  }
  let best = [1, 128, 128, 128];
  for (const s of bins.values()) if (s[0] > best[0]) best = s;
  return hexOf([best[1] / best[0], best[2] / best[0], best[3] / best[0]]);
}

/* ---- notes formatting ----
   Notes and scrolls are plain text with a few marks: **bold**, _italic_,
   "## " heading, "- " bullets, "1. " numbers, "> " quotes. */

const WRAP = { bold: "**", italic: "_" };
const PREFIX = { heading: "## ", bullet: "- ", number: "1. ", quote: "> " };
const LINE_MARK = { heading: /^## /, bullet: /^[-*] /, number: /^\d+\. /, quote: /^> ?/ };

/* What a toolbar button does to a textarea: the range to replace, the text
   to put there, and the selection afterwards. Applying it twice undoes it. */
function format(v, s, e, kind) {
  const m = WRAP[kind];
  if (m) {
    if (v.slice(s - m.length, s) === m && v.slice(e, e + m.length) === m) {
      return { from: s - m.length, to: e + m.length, insert: v.slice(s, e), sel: [s - m.length, e - m.length] };
    }
    return { from: s, to: e, insert: m + v.slice(s, e) + m, sel: [s + m.length, e + m.length] };
  }
  const a = v.lastIndexOf("\n", s - 1) + 1;
  let b = v.indexOf("\n", e > s && v[e - 1] === "\n" ? e - 1 : e);
  if (b < 0) b = v.length;
  const lines = v.slice(a, b).split("\n"), re = LINE_MARK[kind];
  const all = lines.every(l => re.test(l));
  const insert = lines.map((l, i) => all ? l.replace(re, "")
    : (kind === "number" ? `${i + 1}. ` : PREFIX[kind]) + l.replace(/^(## |[-*] |\d+\. |> ?)/, "")).join("\n");
  return { from: a, to: b, insert, sel: s === e ? [a + insert.length, a + insert.length] : [a, a + insert.length] };
}

/* Text → blocks: { type: p | h | ul | ol | quote, lines }. A blank line
   ends a block; neighbouring lines of the same kind join it. */
function blocks(text) {
  const out = [];
  let gap = true;
  for (const line of text.split("\n")) {
    if (!line.trim()) { gap = true; continue; }
    let type = "p", body = line, m;
    if ((m = /^## (.*)/.exec(line))) [type, body] = ["h", m[1]];
    else if ((m = /^[-*] (.*)/.exec(line))) [type, body] = ["ul", m[1]];
    else if ((m = /^\d+\. (.*)/.exec(line))) [type, body] = ["ol", m[1]];
    else if ((m = /^> ?(.*)/.exec(line))) [type, body] = ["quote", m[1]];
    const last = out[out.length - 1];
    if (last && !gap && last.type === type && type !== "h") last.lines.push(body);
    else out.push({ type, lines: [body] });
    gap = false;
  }
  return out;
}

/* A line → spans of plain (""), bold ("b") and italic ("i") text. */
function spans(line) {
  const out = [], re = /\*\*(.+?)\*\*|(?<![\p{L}\p{N}])_(.+?)_(?![\p{L}\p{N}])/gu;
  let from = 0, m;
  while ((m = re.exec(line))) {
    if (m.index > from) out.push({ t: "", text: line.slice(from, m.index) });
    out.push(m[1] != null ? { t: "b", text: m[1] } : { t: "i", text: m[2] });
    from = re.lastIndex;
  }
  if (from < line.length) out.push({ t: "", text: line.slice(from) });
  return out;
}

const plain = text => blocks(text).map(b => b.lines.map(l => spans(l).map(s => s.text).join("")).join(" ")).join(" ");

/* ---- DOM ---- */

const $ = id => document.getElementById(id);
const rail = $("rail"), track = $("track"), card = $("card"), search = $("q"), chips = $("chips");
const shelves = document.querySelector("main"), reading = $("reading"), readingTrack = $("reading-track");
const detail = $("detail"), editor = $("editor"), form = $("form");
const calm = matchMedia("(prefers-reduced-motion: reduce)");
const GAP = 6;                    // space after each thing on the shelf, px (matches .slot margin)

let items = [];
let genre = "";                  // the genre chosen above the shelf, lower-case; "" for all
let owner = false;                // signed in? The server decides; this only shows or hides the tools
let editing = null, dirty = false, privateTouched = false;
let draft = { cover: "", coverData: null, color: "" };   // the cover being edited
let looping = false, offset = 0, glide = 0, vel = 0, idleUntil = 0, lastT = 0;
let hoverSlot = null, cardFor = null, follow = null, drag = null, swallowClick = false;
let detailSlot = null, closing = false;

const byId = id => items.find(i => i.id === id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function icon(id) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  use.setAttribute("href", "#" + id);
  svg.append(use);
  return svg;
}
function iconBtn(id, label, cls = "icon-btn") {
  const b = el("button", cls);
  b.type = "button";
  b.title = label;
  b.setAttribute("aria-label", label);
  b.append(icon(id));
  return b;
}
const day = iso => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/* Text with the searched-for words marked. Built from text nodes, never HTML. */
function markInto(e, text, ws) {
  let from = 0;
  for (const [s, t] of hits(text, ws)) {
    e.append(text.slice(from, s), el("mark", "", text.slice(s, t)));
    from = t;
  }
  e.append(text.slice(from));
  return e;
}
const marked = (tag, cls, text) => markInto(el(tag, cls), text, words(search.value));

/* Formatted notes as real elements: headings, lists, quotes, bold, italic. */
function rich(cls, text, ws = words(search.value)) {
  const box = el("div", "rich " + cls);
  const inline = (parent, line) => {
    for (const s of spans(line)) {
      if (!s.t) { markInto(parent, s.text, ws); continue; }
      parent.append(markInto(el(s.t === "b" ? "strong" : "em"), s.text, ws));
    }
  };
  for (const b of blocks(text)) {
    if (b.type === "ul" || b.type === "ol") {
      const list = el(b.type);
      for (const l of b.lines) { const li = el("li"); inline(li, l); list.append(li); }
      box.append(list);
      continue;
    }
    const e = el(b.type === "h" ? "h4" : b.type === "quote" ? "blockquote" : "p");
    b.lines.forEach((l, i) => { if (i) e.append(el("br")); inline(e, l); });
    box.append(e);
  }
  return box;
}

function stars(n) {
  const s = el("p", "stars", "★".repeat(n) + "☆".repeat(5 - n));
  s.setAttribute("role", "img");
  s.setAttribute("aria-label", `${n} of 5 stars`);
  return s;
}

/* ---- books, scrolls and the shelf ---- */

/* A book as a 3D box H px tall: cover, back, spine, page edges. The spine
   faces you on the shelf; the cover faces you when it is taken down. */
function bookBox(it, H) {
  const k = H / RAIL_H, W = Math.round(H * .66), T = Math.round(spineWidth(it.pages) * k);
  const bg = it.color || settle(FALLBACK[hash(it.title + "|" + it.author) % FALLBACK.length]);
  const box = el("div", "box");
  for (const [name, v] of [["--bh", H], ["--bw", W], ["--bt", T]]) box.style.setProperty(name, v + "px");
  box.style.setProperty("--spine", bg);
  box.style.setProperty("--spine-ink", inkFor(bg));

  const cover = el("div", "face cover");
  if (it.cover) cover.style.backgroundImage = `url("${it.cover}")`;
  else cover.append(el("span", "cover-title", it.title), el("span", "cover-author", it.author || ""));

  const spine = el("div", "face spine");
  const author = it.author && T >= 34 * k;
  const [fs, lines] = spineFont(it.title, T / k, RAIL_H - 56 - (author ? 50 : 0));
  spine.style.setProperty("--fs", fs * k + "px");
  spine.dataset.lines = lines;
  spine.append(el("span", "spine-title", it.title));
  if (author) spine.append(el("span", "spine-author", lastName(it.author)));

  box.append(cover, el("div", "face back"), spine, el("div", "face fore"), el("div", "face top"), el("div", "face bottom"));
  box.dims = { W, H, T };
  return box;
}

function slot(it, k = 1) {
  const b = el("button", `slot item ${it.kind}`);
  b.type = "button";
  b.dataset.id = it.id;
  if (it.kind === "book") {
    const box = bookBox(it, Math.round(k * (212 + (hash(it.title + "|" + it.author) >>> 4) % 46)));
    for (const name of ["--bh", "--bw", "--bt"]) b.style.setProperty(name, box.style.getPropertyValue(name));
    b.setAttribute("aria-label", `${it.title}${it.author ? " by " + it.author : ""}`);
    b.append(box);
  } else {
    b.style.setProperty("--rh", 184 + hash(it.id) % 36 + "px");
    b.setAttribute("aria-label", `Scroll: ${it.title}`);
    const roll = el("span", "roll");
    roll.append(el("span", "roll-title", it.title));
    b.append(roll);
  }
  return b;
}

/* One pill per genre above the shelf, "All" first. */
function fillGenres() {
  const names = new Map();
  for (const it of items) for (const g of genresOf(it)) if (!names.has(g.toLowerCase())) names.set(g.toLowerCase(), g);
  const sorted = [...names].sort((a, b) => a[1].localeCompare(b[1]));
  if (!names.has(genre)) genre = "";
  chips.replaceChildren(...[["", "All"], ...sorted].map(([key, name]) => {
    const b = el("button", "chip", name);
    b.type = "button";
    b.dataset.genre = key;
    b.setAttribute("aria-pressed", String(key === genre));
    return b;
  }));
  $("genres").replaceChildren(...sorted.map(([, n]) => new Option(n)));
}

function render() {
  fillGenres();
  const ws = words(search.value), g = genre;
  const fits = it => matches(it, ws) && (!g || genresOf(it).some(x => x.toLowerCase() === g));
  const out = [], shelf = items.filter(it => !it.reading);
  let shown = 0;
  for (const grp of arrange(shelf)) {
    const list = grp.items.filter(fits);
    if (!list.length) continue;
    out.push(...list.map(it => slot(it)));
    shown += list.length;
  }
  if (!shown) out.push(el("p", "label empty-shelf", shelf.length ? "Nothing on the shelf matches your search." : "The shelf is empty. Press the pen to add your first book."));
  track.replaceChildren(...out);
  // books being read stand below the shelf, face out
  const now = items.filter(it => it.reading && fits(it));
  readingTrack.replaceChildren(...now.map(it => slot(it, .8)));
  reading.hidden = !now.length;
  shown += now.length;
  offset = glide = 0;
  hideCard();
  layout();

  const books = items.filter(i => i.kind === "book");
  $("stats").textContent = !items.length ? "An empty shelf"
    : ws.length || g ? `${shown} of ${items.length} found`
    : [count(books.length, "book"), items.length > books.length && count(items.length - books.length, "scroll"),
       count(books.reduce((n, b) => n + b.pages, 0), "page")].filter(Boolean).join(" · ");
}

/* The shelf loops endlessly: whatever drifts off one end is moved to the
   other, and copies keep it full on wide screens. Only a very small shelf
   (fewer than 8 things, narrower than the screen) stands still instead of
   repeating the same few books. */
function layout() {
  for (const c of track.querySelectorAll(".clone")) c.remove();
  const real = [...track.children], width = track.scrollWidth;
  looping = real.length > 1 && (real.length >= 8 || width > rail.clientWidth);
  rail.classList.toggle("looping", looping);
  if (!looping) { offset = glide = 0; track.style.transform = ""; return; }
  for (let n = Math.ceil((rail.clientWidth + 600) / width); n > 0; n--) {
    for (const r of real) {
      const c = r.cloneNode(true);
      c.classList.add("clone");
      c.setAttribute("aria-hidden", "true");
      c.tabIndex = -1;
      track.append(c);
    }
  }
}

const span = e => e.offsetWidth + GAP;
function normalize() {
  for (let first = track.firstElementChild; offset > span(first); first = track.firstElementChild) {
    offset -= span(first);
    track.append(first);
  }
  while (offset < 0) {
    const last = track.lastElementChild;
    track.prepend(last);
    offset += span(last);
  }
}

/* Every frame: drift when nobody is looking at anything, ease to a stop
   when they are, and glide smoothly wherever wheel, keys or focus send it. */
function tick(t) {
  const dt = Math.min(.05, (t - lastT) / 1000 || 0);
  lastT = t;
  if (looping && !drag) {
    const still = calm.matches || hoverSlot || detail.open || editor.open || follow || t < idleUntil;
    vel += ((still ? 0 : DRIFT) - vel) * (1 - Math.exp(-dt * 1.4));
    if (follow) glide = follow.offsetLeft + follow.offsetWidth / 2 - rail.clientWidth / 2 - offset;
    const g = glide * (1 - Math.exp(-dt * (calm.matches ? 60 : 3.5)));
    glide -= g;
    offset += vel * dt + g;
    normalize();
    track.style.transform = `translate3d(${-offset}px, 0, 0)`;
  }
  if (cardFor) placeCard();
  requestAnimationFrame(tick);
}

rail.addEventListener("wheel", e => {
  if (!looping) return;
  e.preventDefault();
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  glide += d * (e.deltaMode === 1 ? 30 : 1);
  follow = null;
  idleUntil = performance.now() + 2500;
}, { passive: false });

rail.addEventListener("pointerdown", e => {
  swallowClick = false;
  if (looping && e.button === 0) drag = { id: e.pointerId, last: e.clientX, moved: 0, v: 0 };
});
addEventListener("pointermove", e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.last;
  drag.last = e.clientX;
  drag.moved += Math.abs(dx);
  drag.v = dx;
  offset -= dx;
  normalize();
  track.style.transform = `translate3d(${-offset}px, 0, 0)`;
  if (drag.moved > 6) { rail.classList.add("dragging"); hoverSlot = null; hideCard(); }
});
const endDrag = () => {
  if (!drag) return;
  if (drag.moved > 6) { swallowClick = true; glide -= drag.v * 12; }
  drag = null;
  follow = null;
  rail.classList.remove("dragging");
  idleUntil = performance.now() + 2500;
};
addEventListener("pointerup", endDrag);
addEventListener("pointercancel", endDrag);
rail.addEventListener("click", e => { if (swallowClick) { e.preventDefault(); e.stopPropagation(); swallowClick = false; } }, true);

rail.addEventListener("keydown", e => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const list = [...track.querySelectorAll(".item:not(.clone)")], i = list.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  list[(i + (e.key === "ArrowRight" ? 1 : -1) + list.length) % list.length].focus({ preventScroll: true });
});
shelves.addEventListener("focusin", e => {
  const s = e.target.closest(".item");
  if (!s) return;
  if (rail.contains(s)) follow = s;
  if (s.matches(":focus-visible")) showCard(s);
});
shelves.addEventListener("focusout", () => { follow = null; if (!hoverSlot) hideCard(); });
rail.addEventListener("scroll", () => { rail.scrollLeft = 0; });   // focus must not scroll the clipped shelf

shelves.addEventListener("pointerover", e => {
  if (e.pointerType !== "mouse" || drag?.moved > 6) return;
  const s = e.target.closest(".item");
  if (s && s !== hoverSlot) { hoverSlot = s; showCard(s); }
});
shelves.addEventListener("pointerout", e => {
  const s = e.target.closest(".item");
  if (s && !s.contains(e.relatedTarget)) { hoverSlot = null; hideCard(); }
});
shelves.addEventListener("click", e => {
  const s = e.target.closest(".item");
  if (s) (s.classList.contains("book") ? openBook : openScroll)(s);
});

/* ---- the floating card ---- */

function showCard(s) {
  const it = byId(s.dataset.id);
  if (!it) return;
  cardFor = s;
  const facts = it.kind === "book"
    ? [yearText(it.year), it.pages && `${it.pages.toLocaleString()} pp`]
    : [it.year ? yearText(it.year) : "", "written " + day(it.added), it.text && count(it.text.split(/\s+/).filter(Boolean).length, "word")];
  const parts = [
    el("p", "label", [it.kind === "book" ? "Book" : "Scroll", ...genresOf(it), it.private && "Private"].filter(Boolean).join(" · ")),
    el("h3", "", it.title),
  ];
  if (it.author) parts.push(el("p", "by", it.author));
  parts.push(el("p", "label facts-line", facts.filter(Boolean).join(" · ")));
  if (it.rating) parts.push(stars(it.rating));
  if (it.remarks || it.notes) {
    const p = plain(it.remarks || it.notes);
    parts.push(el("p", "excerpt", p.length > 120 ? p.slice(0, 118).trimEnd() + "…" : p));
  }
  card.replaceChildren(...parts);
  placeCard();
  card.classList.add("on");
}
function hideCard() { cardFor = null; card.classList.remove("on"); }
function placeCard() {
  if (!cardFor.isConnected) return hideCard();
  const r = cardFor.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight;
  const x = Math.max(16, Math.min(innerWidth - w - 16, r.left + r.width / 2 - w / 2));
  const y = r.top - h - 40 > 12 ? r.top - h - 40 : Math.min(innerHeight - h - 12, r.bottom + 18);
  card.style.left = x + "px";
  card.style.top = y + "px";
}

/* ---- taking a book down ---- */

const size = () => innerWidth < 760 ? Math.round(Math.min(innerHeight * .42, 380)) : Math.round(Math.min(innerHeight * .64, 560));

function info(it) {
  const a = el("article", "info");
  a.append(marked("p", "label", [it.kind === "book" ? "Book" : "Scroll", ...genresOf(it), it.private && "Private"].filter(Boolean).join(" · ")),
    marked("h2", "title", it.title));
  if (it.author) a.append(marked("p", "by", it.author));
  const facts = el("dl", "facts");
  const fact = (k, v) => { if (!v) return; const d = el("div"); d.append(el("dt", "label", k), el("dd", "", v)); facts.append(d); };
  fact("Year", yearText(it.year));
  if (it.kind === "book") fact("Pages", it.pages.toLocaleString());
  else fact("Words", it.text && it.text.split(/\s+/).filter(Boolean).length.toLocaleString());
  fact(it.kind === "book" ? "Shelved" : "Written", day(it.added));
  const host = linkHost(it.link || "");
  if (host) {
    const d = el("div", "read"), dd = el("dd"), go = el("a", "", host + " ↗");
    go.href = it.link;
    go.target = "_blank";
    go.rel = "noopener noreferrer";
    dd.append(go);
    d.append(el("dt", "label", "Read online"), dd);
    facts.append(d);
  }
  a.append(facts);
  if (it.rating) a.append(stars(it.rating));
  const tags = genresOf(it);
  if (tags.length) {
    const ul = el("ul", "tags");
    for (const t of tags) ul.append(marked("li", "label", t));
    a.append(ul);
  }
  if (owner || it.remarks) {
    a.append(el("h3", "label remarks", "Remarks"), it.remarks ? rich("notes", it.remarks) : el("p", "empty", "No remarks yet."));
  }
  if (it.notes) a.append(el("h3", "label remarks", "Notes · private"), rich("notes", it.notes));   // the server sends notes only to you
  return a;
}

function chrome(it) {
  const tools = el("div", "detail-tools");
  const pen = iconBtn("i-pen", `Edit “${it.title}”`, "icon-btn owner-only"), close = iconBtn("i-close", "Close");
  pen.onclick = () => { finishDetail(); openEditor(it); };
  close.onclick = closeDetail;
  tools.append(pen, close);
  return tools;
}

/* The flight between shelf and stage, as transforms of the stage's box:
   `at` the shelf, lifted `out` of it, and `home` on the stage. A book being
   read already faces you (turned as in .reading .slot .box). */
function flight(s, box, float) {
  const sr = s.getBoundingClientRect(), fr = float.getBoundingClientRect(), { W, H } = box.dims;
  const sc = s.offsetHeight / H, dx = sr.left + sr.width / 2 - (fr.left + fr.width / 2), dy = sr.bottom - sc * H / 2 - (fr.top + fr.height / 2);
  const [z, turn] = reading.contains(s) ? [0, 10] : [-W / 2, 90];
  return {
    at: `translate(${dx}px, ${dy}px) scale3d(${sc}, ${sc}, ${sc}) translateZ(${z}px) rotateY(${turn}deg)`,
    out: `translate(${dx}px, ${dy - 80}px) scale3d(${sc * 1.08}, ${sc * 1.08}, ${sc * 1.08}) translateZ(${z + 40}px) rotateY(${turn - 10}deg)`,
    home: "translate(0px, 0px) scale3d(1, 1, 1) translateZ(0px) rotateY(14deg)",
  };
}

function openBook(s) {
  const it = byId(s.dataset.id);
  if (!it || detail.open) return;
  hoverSlot = null;
  hideCard();
  const box = bookBox(it, size()), float = el("div", "float"), stage = el("div", "stage"), panel = info(it);
  for (const name of ["--bw", "--bh"]) float.style.setProperty(name, box.style.getPropertyValue(name));
  float.append(box);
  stage.append(float);
  const grid = el("div", "detail-grid");
  grid.append(stage, panel);
  detail.className = "book";
  detail.replaceChildren(chrome(it), grid);
  detail.showModal();
  detailSlot = s;
  panel.querySelector("mark")?.scrollIntoView({ block: "center" });
  if (calm.matches) return float.classList.add("bobbing");

  const f = flight(s, box, float);
  s.style.visibility = "hidden";
  box.animate([{ transform: f.at }, { transform: f.out, offset: .3 }, { transform: f.home }],
    { duration: 1700, easing: "cubic-bezier(.45,.05,.25,1)" }).finished.then(() => float.classList.add("bobbing"), () => {});
  panel.animate([{ opacity: 0, transform: "translateY(28px)" }, { opacity: 1, transform: "none" }],
    { duration: 1100, delay: 900, easing: "cubic-bezier(.22,.61,.36,1)", fill: "backwards" });
}

function openScroll(s) {
  const it = byId(s.dataset.id);
  if (!it || detail.open) return;
  hoverSlot = null;
  hideCard();
  const paper = el("div", "parchment"), sheet = el("div", "sheet");
  sheet.append(info(it));
  sheet.querySelector(".facts").after(rich("text", it.text || ""));
  paper.append(el("div", "rod"), sheet, el("div", "rod"));
  detail.className = "scroll";
  detail.replaceChildren(chrome(it), paper);
  detail.showModal();
  detailSlot = s;
  sheet.querySelector("mark")?.scrollIntoView({ block: "center" });
  if (calm.matches) return;
  const cs = getComputedStyle(sheet);
  sheet.animate([
    { height: "0px", paddingTop: "0px", paddingBottom: "0px" },
    { height: sheet.offsetHeight + "px", paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
  ], { duration: 1400, easing: "cubic-bezier(.3,.6,.3,1)" });
  paper.animate([{ opacity: 0, transform: "translateY(30px)" }, { opacity: 1, transform: "none" }], { duration: 900, easing: "ease-out" });
}

function finishDetail() {
  detail.close();
  if (detailSlot) detailSlot.style.visibility = "";
  detailSlot = null;
  closing = false;
}

/* The book drifts back into its gap on the shelf; a scroll rolls itself up. */
async function closeDetail() {
  if (closing || !detail.open) return;
  closing = true;
  const s = detailSlot, box = detail.querySelector(".stage .box"), sheet = detail.querySelector(".sheet");
  if (!calm.matches) {
    let dim;
    try { dim = detail.animate({ opacity: [1, 0] }, { duration: 1300, pseudoElement: "::backdrop", fill: "forwards" }); } catch {}
    for (const p of detail.querySelectorAll(".info, .detail-tools")) {
      if (box) p.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: "forwards" });
    }
    if (box && s?.isConnected) {
      const float = box.parentElement;
      float.classList.remove("bobbing");
      const f = flight(s, box, float);
      await box.animate([{ transform: f.home }, { transform: f.out, offset: .7 }, { transform: f.at }],
        { duration: 1300, easing: "cubic-bezier(.45,.05,.25,1)", fill: "forwards" }).finished.catch(() => {});
    } else if (sheet) {
      const cs = getComputedStyle(sheet);
      await sheet.animate([
        { height: sheet.offsetHeight + "px", paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
        { height: "0px", paddingTop: "0px", paddingBottom: "0px" },
      ], { duration: 800, easing: "cubic-bezier(.6,0,.4,1)", fill: "forwards" }).finished.catch(() => {});
      await detail.querySelector(".parchment").animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(24px)" }],
        { duration: 450, fill: "forwards" }).finished.catch(() => {});
    }
    finishDetail();
    dim?.cancel();
    return;
  }
  finishDetail();
}

detail.addEventListener("cancel", e => { e.preventDefault(); closeDetail(); });
detail.addEventListener("click", e => { if (e.target === detail || e.target.classList.contains("detail-grid")) closeDetail(); });

/* ---- arrivals ---- */

function centerOn(s) {
  if (!looping || !rail.contains(s)) return;
  offset = s.offsetLeft + s.offsetWidth / 2 - rail.clientWidth / 2;
  glide = 0;
  normalize();
  track.style.transform = `translate3d(${-offset}px, 0, 0)`;
  idleUntil = performance.now() + 4000;
}

const slotOf = id => shelves.querySelector(`.item:not(.clone)[data-id="${id}"]`);

/* A new book floats down into its place on the shelf. */
function land(id) {
  const s = slotOf(id);
  if (!s) return;
  (rail.contains(s) ? rail : s).scrollIntoView({ block: "center", behavior: calm.matches ? "auto" : "smooth" });
  centerOn(s);
  if (calm.matches) return;
  if (s.classList.contains("scroll")) return rollUp(s, byId(id));
  s.animate([{ transform: "translateY(-220px)", opacity: 0 }, { opacity: 1, offset: .5 }, { transform: "none", opacity: 1 }],
    { duration: 2000, easing: "cubic-bezier(.22,.61,.36,1)" });
}

/* A new scroll appears open, rolls itself up, and stands in its place. */
async function rollUp(target, it) {
  target.style.visibility = "hidden";
  const p = el("div", "parchment rolling"), sheet = el("div", "sheet");
  sheet.append(el("h2", "title", it.title), rich("text", (it.text || "").slice(0, 600), []));
  p.append(el("div", "rod"), sheet, el("div", "rod"));
  p.setAttribute("aria-hidden", "true");
  document.body.append(p);
  const cs = getComputedStyle(sheet);
  await p.animate([{ opacity: 0, transform: "translateY(30px)" }, { opacity: 1, transform: "none" }], { duration: 700, easing: "ease-out" }).finished;
  await sheet.animate([
    { height: sheet.offsetHeight + "px", paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
    { height: "0px", paddingTop: "0px", paddingBottom: "0px" },
  ], { duration: 1100, easing: "cubic-bezier(.6,0,.4,1)", fill: "forwards" }).finished;
  const from = p.getBoundingClientRect(), to = target.getBoundingClientRect();
  const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
  await p.animate([{ transform: "none" }, {
    transform: `translate(${dx}px, ${dy}px) rotate(90deg) scale(${to.height / from.width}, ${to.width / from.height})`,
  }], { duration: 1000, easing: "cubic-bezier(.45,.05,.25,1)", fill: "forwards" }).finished;
  p.remove();
  target.style.visibility = "";
}

function glow(id) {
  const s = slotOf(id);
  if (!s) return;
  centerOn(s);
  if (!calm.matches) s.animate([{ filter: "brightness(1.35) drop-shadow(0 0 18px oklch(0.85 0.1 75))" }, { filter: "none" }], 1800);
}

/* ---- saving ---- */

/* The server answers every request with {owner, items}: the whole library
   when you are signed in, the public shelf when you are not. */
async function send(body) {
  let r;
  try {
    r = await fetch("api/library.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }
  const data = await r.json().catch(() => null);
  if (r.status === 401 && body.op !== "login") {
    setOwner(false);
    openSignin();
    throw new Error("You were signed out. Sign in, then save again: nothing you typed is lost.");
  }
  if (!r.ok || !Array.isArray(data?.items)) throw new Error(data?.error || (r.ok
    ? "This server can't run PHP, so nothing was saved. Start the site with: php -S localhost:8000"
    : `Something went wrong (${r.status}).`));
  items = data.items;
  setOwner(data.owner);
}

/* ---- signing in ----
   There is no sign-in button: open the site at #signin. What you may see and
   change is decided by the server; this only shows or hides the tools. */

function setOwner(v) {
  owner = !!v;
  document.body.classList.toggle("owner", owner);
}

function openSignin() {
  if ($("signin").open) return;
  $("signin-form").reset();
  $("signin-error").textContent = "";
  $("signin").showModal();
}
const dropHash = () => history.replaceState(null, "", location.pathname + location.search);
const checkHash = () => { if (location.hash === "#signin") owner ? dropHash() : openSignin(); };

$("signin-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, btn = f.querySelector(".solid-btn");
  btn.disabled = true;
  $("signin-error").textContent = "";
  try {
    await send({ op: "login", password: f.elements.password.value });
    f.reset();
    $("signin").close();
    dropHash();
    render();
  } catch (err) {
    $("signin-error").textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});
$("signin").addEventListener("close", () => { $("signin-form").reset(); if (location.hash === "#signin") dropHash(); });
$("signin-cancel").onclick = () => $("signin").close();
$("signout").onclick = async () => {
  try { await send({ op: "logout" }); } catch { setOwner(false); }
  render();
};
addEventListener("hashchange", checkHash);

/* ---- the editor ---- */

const coverStatus = t => { $("cover-status").textContent = t; };
function showCover() {
  const p = $("cover-preview"), src = draft.coverData || draft.cover;
  p.style.backgroundImage = src ? `url("${src}")` : "";
  p.classList.toggle("has", !!src);
}

function openEditor(it) {
  editing = it || null;
  form.reset();
  $("form-title").textContent = it ? `Edit “${it.title}”` : "Add to the archive";
  $("save").textContent = it ? "Save" : "Put it on the shelf";
  $("form-error").textContent = "";
  $("remove").hidden = !it;
  coverStatus("");
  for (const f of ["kind", "title", "author", "year", "genre", "pages", "isbn", "link", "text", "remarks", "notes", "rating"]) {
    if (it && it[f] != null) form.elements[f].value = it[f];
  }
  draft = { cover: it?.cover || "", coverData: null, color: it?.color || "" };
  form.elements.private.checked = !!it?.private;
  form.elements.reading.checked = !!it?.reading;
  privateTouched = false;
  showCover();
  for (const v of form.querySelectorAll(".rich.preview")) v.hidden = true;
  for (const t of form.querySelectorAll("textarea[data-rich]")) t.hidden = false;
  for (const p of form.querySelectorAll(".tool-preview")) p.setAttribute("aria-pressed", "false");
  setKind();
  dirty = false;
  editor.showModal();
}

function setKind() {
  const k = form.elements.kind.value;
  if (!editing && !privateTouched) form.elements.private.checked = k === "scroll";   // your writings start private
  $("for-book").disabled = k !== "book";
  $("for-scroll").disabled = k !== "scroll";
}

/* Covers come from Open Library, looked up by ISBN or by title and author.
   They are shrunk, re-encoded as JPEG and colour-sampled here, then stored
   on your own server with the book. */
let lookingFor = "";
async function findCover(auto) {
  const f = form.elements, title = f.title.value.trim(), author = f.author.value.trim();
  const isbn = f.isbn.value.replace(/[^0-9Xx]/g, "");
  if (f.kind.value !== "book") return;
  if (!title && !isbn) { if (!auto) coverStatus("Type a title or an ISBN first."); return; }
  const key = isbn || `${title}|${author}`;
  if (auto && (draft.cover || draft.coverData || key === lookingFor)) return;
  lookingFor = key;
  coverStatus("Looking for the cover…");
  try {
    const q = isbn ? `isbn=${isbn}` : `title=${encodeURIComponent(title)}${author ? "&author=" + encodeURIComponent(author) : ""}`;
    const d = await (await fetch(`https://openlibrary.org/search.json?${q}&limit=5&fields=cover_i,first_publish_year`)).json();
    if (key !== lookingFor) return;
    const doc = d.docs?.find(x => x.cover_i), year = d.docs?.find(x => x.first_publish_year)?.first_publish_year;
    if (year && !f.year.value) f.year.value = year;
    // a search can hand back another edition's cover (a translation, a study guide);
    // with an ISBN, ask for that exact edition's cover first
    let img = isbn ? await fetch(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`) : null;
    if (!img?.ok) {
      if (!doc) return coverStatus("No cover found. You can upload one instead.");
      img = await fetch(`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`);
    }
    if (!img.ok) throw new Error();
    await useCover(await img.blob());
    if (key === lookingFor) coverStatus("Found on Open Library.");
  } catch {
    coverStatus("Couldn't reach Open Library. You can upload a cover instead.");
  }
}

async function useCover(blob) {
  const bmp = await createImageBitmap(blob);
  const h = Math.min(720, bmp.height), w = Math.round(bmp.width * h / bmp.height);
  const big = Object.assign(document.createElement("canvas"), { width: w, height: h });
  big.getContext("2d").drawImage(bmp, 0, 0, w, h);
  const small = Object.assign(document.createElement("canvas"), { width: 48, height: 72 });
  const g = small.getContext("2d");
  g.drawImage(big, 0, 0, 48, 72);
  draft.coverData = big.toDataURL("image/jpeg", .85);
  draft.color = settle(dominant(g.getImageData(0, 0, 48, 72).data));
  dirty = true;
  showCover();
}

$("cover-find").onclick = () => findCover(false);
$("cover-file").onchange = async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try { await useCover(file); coverStatus("Your image will be used as the cover."); }
  catch { coverStatus("That image couldn't be read. Try a JPEG or PNG."); }
};
$("cover-clear").onclick = () => { draft = { cover: "", coverData: null, color: "" }; dirty = true; showCover(); coverStatus(""); };
for (const name of ["title", "author", "isbn"]) form.elements[name].addEventListener("change", () => findCover(true));

/* The formatting toolbar above each notes box. */
const TOOLS = [["bold", "B", "Bold (⌘B)"], ["italic", "I", "Italic (⌘I)"], ["heading", "H", "Heading"],
               ["bullet", "•", "Bulleted list"], ["number", "1.", "Numbered list"], ["quote", "❝", "Quote"]];
function applyFormat(ta, kind) {
  const r = format(ta.value, ta.selectionStart, ta.selectionEnd, kind);
  ta.focus();
  ta.setSelectionRange(r.from, r.to);
  // insertText keeps ⌘Z working; setRangeText is the fallback
  if (!document.execCommand("insertText", false, r.insert)) ta.setRangeText(r.insert, r.from, r.to, "end");
  ta.setSelectionRange(r.sel[0], r.sel[1]);
  dirty = true;
}
for (const ta of form.querySelectorAll("textarea[data-rich]")) {
  const bar = el("div", "toolbar"), view = el("div", "rich preview");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Formatting");
  for (const [kind, label, name] of TOOLS) {
    const b = el("button", `tool tool-${kind}`, label);
    b.type = "button";
    b.title = name;
    b.setAttribute("aria-label", name);
    b.onmousedown = e => e.preventDefault();          // keep the text selected
    b.onclick = () => { if (!ta.hidden) applyFormat(ta, kind); };
    bar.append(b);
  }
  const prev = el("button", "tool tool-preview", "Preview");
  prev.type = "button";
  prev.setAttribute("aria-pressed", "false");
  prev.onclick = () => {
    const on = view.hidden;
    view.hidden = !on;
    ta.hidden = on;
    prev.setAttribute("aria-pressed", String(on));
    if (on) view.replaceChildren(...rich("", ta.value || "Nothing written yet.", []).childNodes);
    else ta.focus();
  };
  bar.append(prev);
  view.hidden = true;
  ta.before(bar);
  ta.after(view);
  ta.addEventListener("keydown", e => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const kind = { b: "bold", i: "italic" }[e.key.toLowerCase()];
    if (kind) { e.preventDefault(); applyFormat(ta, kind); }
  });
}

async function remove(it) {
  if (!confirm(`Remove “${it.title}” from the archive?`)) return;
  try { await send({ op: "delete", id: it.id }); } catch (err) { $("form-error").textContent = err.message; return; }
  dirty = false;
  editor.close();
  const s = slotOf(it.id);
  if (s && !calm.matches) {
    await s.animate([{ opacity: 1 }, { transform: "translateY(-60px)", opacity: 0 }],
      { duration: 900, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" }).finished;
  }
  render();
}

form.addEventListener("input", () => { dirty = true; });
form.addEventListener("change", e => {
  if (e.target.name === "kind") setKind();
  if (e.target.name === "private") privateTouched = true;
});

form.addEventListener("submit", async e => {
  e.preventDefault();
  const f = new FormData(form);
  const item = {
    id: editing ? editing.id : crypto.randomUUID(),
    kind: f.get("kind"),
    title: f.get("title").trim(),
    author: f.get("author").trim(),
    genre: genresOf({ genre: f.get("genre") }).join(", "),
    year: f.get("year") === "" ? null : Number(f.get("year")),
    rating: Number(f.get("rating")) || 0,
    private: form.elements.private.checked,
    remarks: f.get("remarks"),
    notes: f.get("notes"),
  };
  if (item.kind === "book") {
    Object.assign(item, { pages: Number(f.get("pages")), isbn: f.get("isbn").trim(), link: f.get("link").trim(),
                          cover: draft.cover, color: draft.color, reading: form.elements.reading.checked });
    if (draft.coverData) item.coverData = draft.coverData;
  } else {
    item.text = f.get("text");
  }

  const btn = $("save");
  btn.disabled = true;
  $("form-error").textContent = "";
  try {
    await send({ op: "put", item });
  } catch (err) {
    $("form-error").textContent = err.message;   // the dialog stays open, so nothing typed is lost
    return;
  } finally {
    btn.disabled = false;
  }
  dirty = false;
  editor.close();
  if (!editing) { search.value = ""; genre = ""; }
  render();
  if (editing) glow(item.id); else land(item.id);
});

const discard = () => !dirty || confirm("Discard what you've written?");
$("cancel").onclick = () => { if (discard()) editor.close(); };
editor.addEventListener("cancel", e => { if (!discard()) e.preventDefault(); });
$("remove").onclick = () => remove(editing);
$("add").onclick = () => openEditor();

/* ---- the heading types itself ---- */

function typeHeading() {
  const out = $("typed"), parts = [["Welcome to my ", ""], ["archive", "em"], [".", ""]];
  const total = parts.reduce((n, [t]) => n + t.length, 0);
  const done = () => document.body.classList.add("ready");
  const show = n => {
    out.replaceChildren();
    for (const [text, tag] of parts) {
      const piece = text.slice(0, Math.max(0, n));
      n -= text.length;
      if (piece) out.append(tag ? el(tag, "", piece) : piece);
    }
  };
  if (calm.matches) { show(total); return done(); }
  let i = 0;
  const step = () => {
    show(++i);
    if (i >= total) return setTimeout(done, 300);
    setTimeout(step, 70 + Math.random() * 80 + (i === 14 ? 260 : 0));
  };
  setTimeout(step, 700);
}

let resizing = 0;
addEventListener("resize", () => { cancelAnimationFrame(resizing); resizing = requestAnimationFrame(layout); });
search.addEventListener("input", render);
chips.addEventListener("click", e => {
  const b = e.target.closest(".chip");
  if (b) { genre = b.dataset.genre; render(); }
});

typeHeading();
requestAnimationFrame(tick);
fetch("api/library.php", { cache: "no-store" })
  .then(r => r.ok ? r.json() : Promise.reject())
  .then(d => { items = Array.isArray(d.items) ? d.items : []; setOwner(d.owner); render(); checkHash(); })
  .catch(() => track.replaceChildren(el("p", "label empty-shelf", "The archive could not be loaded. Refresh the page to try again.")));
