/* Saeed's Archive — what every page shares: plain logic first (test.js runs
   everything above the DOM marker), then small helpers for the pages. */
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

/* A course's classes under their modules: classes in a row with the same
   module form one group. `i` is each class's place in the course. */
const modulesOf = classes => classes.reduce((out, c, i) => {
  if (!out.length || (c.module || "") !== out.at(-1).name) out.push({ name: c.module || "", classes: [] });
  out.at(-1).classes.push({ ...c, i });
  return out;
}, []);

/* Named groups (a course's batches of classes, the links page's groups of
   links) after `x` is saved into the group named `to` (made if new; groups stay
   in name and number order), or removed when x is null. `at` is its place in
   groups[from][key] if it is there already (-1 if new); something that stays in
   its group keeps its place. A group this leaves with nothing at all (no
   classes, no resources) goes, unless it is the last; one that was already
   empty (waiting to be filled) stays. */
function place(groups, key, from, at, x, to) {
  const out = structuredClone(groups), src = out[from], stays = x && at >= 0 && to === src.name;
  if (at >= 0) src[key].splice(at, 1, ...(stays ? [x] : []));
  if (x && !stays) {
    let dst = out.find(g => g.name === to);
    if (!dst) {
      out.push(dst = { name: to, [key]: [] });
      out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    }
    dst[key].push(x);
  }
  if (at >= 0 && Object.values(src).every(v => !Array.isArray(v) || !v.length) && out.length > 1) out.splice(out.indexOf(src), 1);
  return out;
}
/* One of five tints for each module group: a module keeps its tint wherever it
   shows up again, and a new one takes the tint after the group above it. */
function moduleTints(groups) {
  const seen = new Map();
  let last = -1;
  return groups.map(m => {
    if (!seen.has(m.name)) seen.set(m.name, (last + 1) % 5);
    return last = seen.get(m.name);
  });
}
const placeClass = (course, from, at, x, to) => ({ ...course, batches: place(course.batches, "classes", from, at, x, to) });

/* The video id of a YouTube address ("" for anything else), so only YouTube
   ever plays inside the page. */
const youtubeId = u => {
  try {
    const x = new URL(u), host = x.hostname.replace(/^(www|m)\./, "");
    const id = host === "youtu.be" ? x.pathname.slice(1)
      : host === "youtube.com" ? x.searchParams.get("v") || (x.pathname.match(/^\/(?:embed|live|shorts)\/([^/]+)/) || [])[1] : "";
    return /^https?:$/.test(x.protocol) && /^[\w-]{11}$/.test(id || "") ? id : "";
  } catch { return ""; }
};

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
const classMatches = (c, ws) => {
  const hay = fold([c.title, c.module, c.tag].join("\n"));
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
const calm = matchMedia("(prefers-reduced-motion: reduce)");
let dirty = false;                 // something typed into the open form and not saved yet
const discard = () => !dirty || confirm("Discard what you've written?");

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

const auto = e => { e.dir = "auto"; return e; };   // names may be Urdu, read right to left
const numbered = (e, n, title, ws) => {             // a class's number in its batch, then its title
  e.append(el("span", "lesson-n", String(n)), auto(markInto(el("span", "lesson-text"), title, ws)));
  return e;
};
function outLink(url, cls) {
  const a = el("a", cls);
  if (linkHost(url)) Object.assign(a, { href: url, target: "_blank", rel: "noopener noreferrer" });
  return a;
}

/* A link as a tile in its group's colour: a folder or link icon, the title,
   the site it opens, and an arrow. */
function linkTile(x) {
  const li = el("li"), a = outLink(x.url, "link-card");
  a.append(icon(/\/folders\/|1drv\.ms\/f\//.test(x.url) ? "i-folder" : "i-link"), auto(el("span", "link-title", x.title)),
    el("span", "label link-site", linkHost(x.url)), icon("i-arrow"));
  li.append(a);
  return li;
}

/* ---- saving ---- */

let signedOut = () => {};          // what a page does when a save is turned away; it may return its own message
async function send(body) {
  let r;
  try {
    r = await fetch("api/library.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }
  const data = await r.json().catch(() => null);
  if (r.status === 401 && body.op !== "login") throw new Error(signedOut() || "You were signed out. Sign in, then save again: nothing you typed is lost.");
  if (!r.ok || !data) throw new Error(data?.error || (r.ok
    ? "This server can't run PHP, so nothing was saved. Start the site with: php -S localhost:8000"
    : `Something went wrong (${r.status}).`));
  return data;
}
const TAB = "archive-tab";
const tabKept = () => { try { return sessionStorage.getItem(TAB) === "1"; } catch { return false; } };
const keepTab = () => { try { sessionStorage.setItem(TAB, "1"); } catch {} };
const fetchOwn = async what => {
  if (!tabKept()) { await send({ op: "logout" }).catch(() => {}); return null; }
  return fetch("api/library.php?" + what, { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null);
};

/* ---- the link editor ----
   One form for links kept in groups (a batch's resources are a single group
   without a name): pick a link to change or a new one, then its title, its
   address and, where groups have names, its group. */

const linkEditor = $("link-editor");
let linkJob = null;                // { groups, grouped, at: [group, link] or null, save }

function openLinkEditor(where, groups, grouped, save) {
  const f = linkEditor.querySelector("form");
  linkJob = { groups, grouped, at: null, save };
  f.elements.which.replaceChildren(new Option("A new link", ""), ...groups.flatMap((g, gi) =>
    g.links.map((x, i) => new Option([grouped && g.name, x.title].filter(Boolean).join(" · "), gi + ":" + i))));
  $("link-where").textContent = where;
  $("link-group-field").hidden = !grouped;
  f.elements.group.required = grouped;
  $("link-groups").replaceChildren(...groups.map(g => new Option(g.name)));
  fillLinkForm();
  linkEditor.showModal();
}

function fillLinkForm() {
  const f = linkEditor.querySelector("form"), [g, i] = (f.elements.which.value || "-1:-1").split(":").map(Number);
  const x = linkJob.groups[g]?.links[i];
  linkJob.at = x ? [g, i] : null;
  f.elements.title.value = x?.title || "";
  f.elements.url.value = x?.url || "";
  f.elements.group.value = (x ? linkJob.groups[g] : linkJob.groups.at(-1))?.name || "";
  $("link-form-title").textContent = x ? "Change a link" : "Add a link";
  $("link-remove").hidden = !x;
  $("link-error").textContent = "";
  dirty = false;
}

/* Saves `x` where the form says (x null removes the link picked). */
async function saveLink(x) {
  const f = linkEditor.querySelector("form"), btn = $("link-save"), [g, i] = linkJob.at || [0, -1];
  const to = linkJob.grouped ? f.elements.group.value.trim() : linkJob.groups[0]?.name ?? "";
  btn.disabled = true;
  $("link-error").textContent = "";
  try {
    await linkJob.save(place(linkJob.groups, "links", g, i, x, to));
  } catch (err) {
    $("link-error").textContent = err.message;   // the form stays open, so nothing typed is lost
    return;
  } finally {
    btn.disabled = false;
  }
  dirty = false;
  linkEditor.close();
}

if (linkEditor) {
  const f = linkEditor.querySelector("form");
  f.elements.which.onchange = () => { if (discard()) fillLinkForm(); else f.elements.which.value = linkJob.at ? linkJob.at.join(":") : ""; };
  f.addEventListener("input", e => { if (e.target !== f.elements.which) dirty = true; });
  f.addEventListener("submit", e => { e.preventDefault(); saveLink({ title: f.elements.title.value.trim(), url: f.elements.url.value.trim() }); });
  $("link-remove").onclick = () => { if (confirm(`Remove “${f.elements.title.value}”?`)) saveLink(null); };
  $("link-cancel").onclick = () => { if (discard()) linkEditor.close(); };
  linkEditor.addEventListener("cancel", e => { if (!discard()) e.preventDefault(); });
}
