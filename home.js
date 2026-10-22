/* Saeed's Archive — the home page: one endless shelf. Books are 3D boxes with
   their real cover and a spine coloured from it; writings stand among them as
   scrolls. Below it, the courses. */
"use strict";

const rail = $("rail"), track = $("track"), card = $("card"), search = $("q"), chips = $("chips");
const shelves = document.querySelector("main"), reading = $("reading"), readingTrack = $("reading-track");
const detail = $("detail"), editor = $("editor"), form = $("form");
const GAP = 6;                    // space after each thing on the shelf, px (matches .slot margin)

let items = [];
let genre = "";                  // the genre chosen above the shelf, lower-case; "" for all
let owner = false, guest = false;
let editing = null, privateTouched = false;
let draft = { cover: "", coverData: null, color: "" };   // the cover being edited
let looping = false, offset = 0, glide = 0, vel = 0, idleUntil = 0, lastT = 0;
let hoverSlot = null, cardFor = null, follow = null, drag = null, swallowClick = false;
let detailSlot = null, closing = false;

const byId = id => items.find(i => i.id === id);

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

  const books = items.filter(i => i.kind === "book"), found = showClasses();
  $("stats").textContent = !items.length ? "An empty shelf"
    : ws.length || g ? `${shown} of ${items.length} found${found ? ` · ${found} class${found === 1 ? "" : "es"}` : ""}`
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
  const y = r.top - h - 70 > 12 ? r.top - h - 70 : Math.min(innerHeight - h - 12, r.bottom + 18);
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
  if (it.notes) a.append(el("h3", "label remarks", "Notes · private"), rich("notes", it.notes));
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

/* Saves, then shows the library as it now stands. */
async function save(body) {
  const data = await send(body);
  if (body.op === "login" || body.op === "guest") keepTab();
  if (Array.isArray(data.items)) { items = data.items; setOwner(data.owner, data.guest); }
  return data;
}
signedOut = () => { setOwner(false); openSignin(); };

/* ---- signing in ---- */

let classesReady = Promise.resolve(), door = "";
function setOwner(v, g = false) {
  const was = [owner, guest];
  owner = !!v;
  guest = !owner && !!g;
  document.body.classList.toggle("owner", owner);
  if (owner !== was[0] || guest !== was[1]) classesReady = loadClasses();
}

function openSignin(to = "") {
  door = to;
  if ($("signin").open) return;
  $("signin-form").reset();
  $("signin-error").textContent = "";
  $("signin").showModal();
}
const dropHash = () => history.replaceState(null, "", location.pathname + location.search);
const checkHash = () => {
  const h = location.hash.slice(1);
  if (h === "signin") owner ? dropHash() : openSignin();
  else if (h === "dashboard") owner ? openDashboard() : openSignin("#dashboard");
  else if (h !== "courses" && /^[A-Za-z0-9]{2,20}$/.test(h)) owner ? dropHash() : openSignin(h.toUpperCase());
};

$("signin-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, btn = f.querySelector(".solid-btn"), to = door, code = /^[A-Z0-9]+$/.test(to) ? to : "";
  btn.disabled = true;
  $("signin-error").textContent = "";
  try {
    await save(code ? { op: "guest", code, password: f.elements.password.value } : { op: "login", password: f.elements.password.value });
    f.reset();
    $("signin").close();
    dropHash();
    if (code) {
      await classesReady;
      if (courses.length === 1) return location.assign("course.html?c=0");
    }
    render();
    if (code) $("classes").scrollIntoView({ block: "start" });
    if (to === "#dashboard") openDashboard();
  } catch (err) {
    $("signin-error").textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});
$("signin").addEventListener("close", () => { $("signin-form").reset(); if (location.hash && location.hash !== "#courses") dropHash(); });
$("signin-cancel").onclick = () => $("signin").close();
$("signout").onclick = async () => {
  try { await save({ op: "logout" }); } catch { setOwner(false); }
  render();
};
addEventListener("hashchange", checkHash);

/* ---- courses ---- */

let courses = [];

async function loadClasses() {
  const got = owner || guest ? (await fetchOwn("classes"))?.courses : [];
  courses = (owner || guest) && Array.isArray(got) ? got.filter(c => c && Array.isArray(c.batches) && c.batches.length) : [];
  showClasses();
  if (location.hash === "#courses" && courses.length) { $("classes").scrollIntoView({ block: "start" }); dropHash(); }   // back from a course page
}

const classesOf = c => c.batches.flatMap(b => b.classes);
const classHits = ws => !ws.length ? [] : courses.flatMap((c, ci) =>
  c.batches.flatMap((b, bi) => b.classes.flatMap((x, i) => classMatches(x, ws) ? [{ ci, bi, i, x }] : [])));
// leaving for a course, this page's place in the history becomes the Courses section, so Back returns there
const toCourse = (cls, q) => Object.assign(el("a", cls), { href: "course.html?" + q, onclick: () => history.replaceState(null, "", "#courses") });

/* The courses as cards, each opening its own page; while searching, the
   classes that match beneath them. Returns how many match. */
function showClasses() {
  $("classes").hidden = !courses.length;
  $("courses").replaceChildren(...courses.map((c, ci) => {
    const a = toCourse("course-card", "c=" + ci), last = c.batches.at(-1).classes.at(-1);
    a.append(auto(el("span", "course-name", c.name)));
    if (c.teacher) a.append(el("span", "course-teacher", c.teacher));
    a.append(el("span", "label", count(classesOf(c).length, "recording")));
    if (last) a.append(el("span", "course-latest", "Latest: " + last.title));
    return a;
  }));
  const ws = words(search.value), found = classHits(ws);
  $("class-hits").hidden = !found.length;
  $("class-hit-list").replaceChildren(...found.map(({ ci, bi, i, x }) => {
    const c = courses[ci], li = el("li"), a = toCourse("hit", `c=${ci}&b=${bi}&i=${i}`);
    a.append(el("span", "label", [c.name, c.batches.length > 1 && c.batches[bi].name, x.module].filter(Boolean).join(" · ")),
      numbered(el("span", "hit-title"), i + 1, x.title, ws));
    li.append(a);
    return li;
  }));
  return found.length;
}

/* ---- links: a pop-up of links in named groups, each opening in a new tab ---- */

const linksDialog = $("links-dialog");
let linkGroups = [];

/* Each group under its name, its links as tiles in the group's colour. */
function showLinks() {
  const n = linkGroups.reduce((k, g) => k + g.links.length, 0);
  $("link-count").textContent = count(n, "link") + (linkGroups.length > 1 ? " in " + count(linkGroups.length, "group") : "");
  $("link-list").replaceChildren(...(!n ? [el("p", "label class-empty", "No links yet. Press the pen to add the first.")] :
    linkGroups.filter(g => g.links.length).map(g => {
      const sec = el("section", "link-group"), ul = el("ul", "link-grid");
      ul.append(...g.links.map(linkTile));
      if (g.name) sec.append(auto(el("h3", "label", g.name)));
      sec.append(ul);
      return sec;
    })));
}

$("links").onclick = async () => {
  const d = await fetchOwn("links");
  linkGroups = Array.isArray(d?.groups) ? d.groups : [];
  showLinks();
  linksDialog.showModal();
  if (!calm.matches) $("links-window").animate([{ opacity: 0, transform: "translateY(30px)" }, { opacity: 1, transform: "none" }], { duration: 900, easing: "cubic-bezier(.22,.61,.36,1)" });
};
$("link-pen").onclick = () => openLinkEditor("Links", linkGroups, true, async next => {
  linkGroups = (await send({ op: "links", groups: next })).groups;
  showLinks();
});
$("links-close").onclick = () => linksDialog.close();
linksDialog.addEventListener("click", e => { if (e.target === linksDialog) linksDialog.close(); });

/* ---- the dashboard: shared links (each opens one course, or one batch, with
   its own password), and when they were opened ---- */

const dash = $("dashboard"), shareForm = $("share-form"), PER_PAGE = 10;
let shares = [], opens = [], openPage = 0, suggested = "";
const shareUrl = code => location.origin + location.pathname + "#" + code;
/* What a link opens, a line for each course or batch. */
function sharedWhat(s) {
  const box = el("div");
  for (const x of s.scope) {
    const c = courses.find(y => y.name === x.course), line = el("div");
    line.append(el("bdi", "", x.course), " · " + (x.batch || "Every batch"));
    if (!c || (x.batch && !c.batches.some(b => b.name === x.batch))) line.append(el("span", "label gone", "No longer there"));
    box.append(line);
  }
  return box;
}
const when = at => new Date(at * 1000).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
function copy(text, b) {
  navigator.clipboard?.writeText(text).then(() => {
    b.classList.add("done");
    setTimeout(() => b.classList.remove("done"), 1600);
  }, () => {});
}
function emptyRow(cols, text) {
  const tr = el("tr"), td = el("td", "label class-empty", text);
  td.colSpan = cols;
  tr.append(td);
  return tr;
}

function showShares() {
  $("share-count").textContent = shares.length ? `· ${shares.length}` : "";
  $("share-rows").replaceChildren(...(!shares.length ? [emptyRow(4, "Nothing shared yet.")] : [...shares].reverse().map(s => {
    const tr = el("tr"), link = el("td"), what = el("td"), pw = el("td"), tools = el("td", "row-tools");
    link.append(el("span", "share-link", shareUrl(s.code)));
    what.append(sharedWhat(s));
    pw.append(el("code", "share-password", s.password || "—"));
    const cp = iconBtn("i-copy", `Copy the link and password of #${s.code}`), pen = iconBtn("i-pen", `New password for #${s.code}`), del = iconBtn("i-trash", `Delete #${s.code}`, "icon-btn trash");
    cp.onclick = () => copy(`${shareUrl(s.code)}\nPassword: ${s.password}`, cp);
    pen.onclick = () => editPassword(s, pw);
    del.onclick = () => confirm(`Delete #${s.code}? Whoever has this link loses access at once.`) && act({ op: "unshare", code: s.code });
    tools.append(cp, pen, del);
    tr.append(link, what, pw, tools);
    return tr;
  })));
}

/* A new password, typed in its place: Enter saves it (left empty, one is
   made), Escape keeps the old one. Whoever used the old one signs in again. */
function editPassword(s, cell) {
  const input = Object.assign(el("input", "pw-input"), { value: s.password, placeholder: "Empty: make one", maxLength: 72, autocomplete: "off" });
  input.setAttribute("aria-label", `New password for #${s.code}`);
  cell.replaceChildren(input);
  input.focus();
  input.select();
  input.onkeydown = async e => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!(await act({ op: "repass", code: s.code, password: input.value }))) input.focus();
  };
}
dash.addEventListener("cancel", e => { if (document.activeElement?.classList.contains("pw-input")) { e.preventDefault(); showShares(); } });

/* Saves a change to the shared links, then shows them as they now stand. */
async function act(body) {
  $("share-error").textContent = "";
  try {
    shares = (await send(body)).shares;
  } catch (err) {
    $("share-error").textContent = err.message;
    return false;
  }
  showShares();
  showOpens();
  return true;
}

function showOpens() {
  const list = [...opens].reverse(), pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  openPage = Math.min(openPage, pages - 1);
  $("open-rows").replaceChildren(...(!list.length ? [emptyRow(3, "Not opened yet.")] : list.slice(openPage * PER_PAGE, (openPage + 1) * PER_PAGE).map(o => {
    const tr = el("tr"), what = el("td"), s = shares.find(x => x.code === o.code);
    what.append(s ? sharedWhat(s) : el("span", "label gone", "Deleted"));
    tr.append(el("td", "", when(o.at)), el("td", "share-link", "#" + o.code), what);
    return tr;
  })));
  $("open-page").textContent = `${openPage + 1} of ${pages}`;
  $("open-prev").disabled = openPage === 0;
  $("open-next").disabled = openPage === pages - 1;
  $("pager").hidden = pages < 2;
}
$("open-prev").onclick = () => { openPage--; showOpens(); };
$("open-next").onclick = () => { openPage++; showOpens(); };

/* What a new link opens: a row of ticks for each course, "Every batch" first;
   ticking it ticks (and holds) all that course's batches. */
function tick(course, batch, text) {
  const label = el("label", "tick"), box = Object.assign(el("input"), { type: "checkbox" });
  Object.assign(box.dataset, { course, batch });
  label.append(box, text);
  return label;
}
function fillScope() {
  $("scope-list").replaceChildren(...courses.map(c => {
    const row = el("div", "scope-course");
    row.append(el("bdi", "scope-name", c.name), tick(c.name, "", "Every batch"), ...c.batches.map(b => tick(c.name, b.name, b.name)));
    return row;
  }));
}
function picked() {
  const all = [...$("scope-list").querySelectorAll("input:checked")].map(b => ({ course: b.dataset.course, batch: b.dataset.batch }));
  const whole = new Set(all.filter(x => !x.batch).map(x => x.course));
  return all.filter(x => !x.batch || !whole.has(x.course));
}
$("scope-list").onchange = e => {
  const b = e.target;
  if (!b.dataset.batch) for (const x of b.closest(".scope-course").querySelectorAll("input:not([data-batch=''])")) Object.assign(x, { checked: b.checked, disabled: b.checked });
  suggest();
};

/* The code follows what is ticked, until you type your own. */
function suggest() {
  const f = shareForm.elements;
  if (f.code.value === suggested) f.code.value = suggested = shareCode(picked());
}

async function openDashboard() {
  await classesReady;
  const d = await fetchOwn("shares");
  shares = Array.isArray(d?.shares) ? d.shares : [];
  opens = Array.isArray(d?.opens) ? d.opens : [];
  openPage = 0;
  shareForm.reset();
  fillScope();
  suggested = "";
  suggest();
  $("share-error").textContent = "";
  showShares();
  showOpens();
  if (dash.open) return;
  dash.showModal();
  if (!calm.matches) $("dash-window").animate([{ opacity: 0, transform: "translateY(30px)" }, { opacity: 1, transform: "none" }], { duration: 900, easing: "cubic-bezier(.22,.61,.36,1)" });
}

shareForm.addEventListener("submit", async e => {
  e.preventDefault();
  const f = shareForm.elements, btn = shareForm.querySelector(".solid-btn"), scope = picked();
  if (!scope.length) { $("share-error").textContent = "Tick at least one course or batch."; return; }
  btn.disabled = true;
  if (await act({ op: "share", scope, code: f.code.value, password: f.password.value })) {
    shareForm.reset();
    fillScope();
    suggested = "";
  }
  btn.disabled = false;
});
$("shares").onclick = openDashboard;
$("dash-close").onclick = () => dash.close();
dash.addEventListener("close", () => { if (location.hash === "#dashboard") dropHash(); });

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
  if (!editing && !privateTouched) form.elements.private.checked = k === "scroll";
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
  try { await save({ op: "delete", id: it.id }); } catch (err) { $("form-error").textContent = err.message; return; }
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
    await save({ op: "put", item });
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
    setTimeout(step, 50 + Math.random() * 60 + (i === parts[0][0].length ? 180 : 0));   // a breath before "archive"
  };
  setTimeout(step, 500);
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
  .then(async d => {
    if ((d.owner || d.guest) && !tabKept()) d = await send({ op: "logout" });
    items = Array.isArray(d.items) ? d.items : [];
    setOwner(d.owner, d.guest);
    render();
    checkHash();
  })
  .catch(() => track.replaceChildren(el("p", "label empty-shelf", "The archive could not be loaded. Refresh the page to try again.")));
