/* Saeed's Archive — a course on a page of its own: its batches, each with its
   resources and its classes (played right here), and the forms that change them.
   course.html?c=<course>[&b=<batch>&i=<class>] opens on that class. */
"use strict";

const ask = new URLSearchParams(location.search), win = $("course-window"), list = $("class-list");
let courses = [], course = +ask.get("c"), batch = -1, playing = null;   // playing: { b, i } of the class on screen
signedOut = () => "You were signed out. Sign in again on the home page, then save here: nothing you typed is lost.";

const classesOf = c => c.batches.flatMap(b => b.classes);
function notesLink(url) {
  const a = outLink(url, "icon-btn notes-link");
  a.title = `Notes (${linkHost(url)})`;
  a.setAttribute("aria-label", a.title);
  a.append(icon("i-file"));
  return a;
}

/* Stores the course as `next`; everything shown is drawn again from what comes back. */
async function saveCourse(next) {
  courses = (await send({ op: "classes", courses: courses.map((c, j) => j === course ? next : c) })).courses;
}

/* The batch on show: a pill for each batch (when there are several), then its
   resources, then two columns: the class (click it to play it here) and its
   notes, if any. */
function fillClassList() {
  const c = courses[course], b = c.batches[batch];
  $("course-label").textContent = `${b.name} · ${count(b.classes.length, "recording")}`;
  $("batch-tabs").replaceChildren(...(c.batches.length < 2 ? [] : c.batches.map((x, j) => {
    const t = el("button", "chip", x.name);
    t.type = "button";
    t.setAttribute("aria-pressed", j === batch);
    t.onclick = () => { batch = j; fillClassList(); list.scrollTop = list.parentElement.scrollTop = 0; };
    return t;
  })));
  const groups = el("ol", "modules"), rs = b.resources || [];
  if (rs.length) {
    const li = el("li", "module resources"), ul = el("ul", "link-grid");
    ul.append(...rs.map(linkTile));
    li.append(el("h3", "label module-name", "Resources"), ul);
    groups.append(li);
  }
  const mods = modulesOf(b.classes), tints = moduleTints(mods);
  mods.forEach((m, k) => {
    const li = el("li", "module"), ol = el("ol", "lessons");
    li.dataset.tint = tints[k];
    for (const x of m.classes) {
      const row = el("li", "lesson"), id = youtubeId(x.url);
      const t = id ? el("button", "lesson-title") : outLink(x.url, "lesson-title");
      if (id) { t.type = "button"; t.onclick = () => playClass(x.i); }
      numbered(t, x.i + 1, x.title, []);
      if (x.tag) t.lastChild.append(el("span", "tag", x.tag));
      if (playing?.b === batch && playing.i === x.i) t.setAttribute("aria-current", "true");
      row.append(t);
      if (linkHost(x.notes || "")) row.append(notesLink(x.notes));
      ol.append(row);
    }
    if (m.name) li.append(el("h3", "label module-name", m.name));
    li.append(ol);
    groups.append(li);
  });
  if (!b.classes.length) groups.append(el("li", "label class-empty", "No classes yet. Press the pen to add the first."));
  list.replaceChildren(groups);
}

/* The video waits for a click to play; while it plays the page around it dims,
   and a pause or the end brightens it again. */
const YT = "https://www.youtube-nocookie.com";
addEventListener("message", e => {
  if (e.origin !== YT || e.source !== $("player").querySelector("iframe")?.contentWindow) return;
  let d;
  try { d = JSON.parse(e.data); } catch { return; }
  const state = d.event === "onStateChange" ? d.info : d.info?.playerState;   // 1 playing, 2 paused, 0 ended, 3 loading
  if (typeof state === "number" && state !== 3) document.body.classList.toggle("watching", state === 1);
});

/* The video plays on the right; the classes slide over to the left. */
function playClass(i) {
  const x = courses[course].batches[batch]?.classes[i], id = x && youtubeId(x.url);
  if (!id) return;
  const player = $("player"), from = list.getBoundingClientRect(), first = !win.classList.contains("playing");
  playing = { b: batch, i };
  document.body.classList.remove("watching");
  const screen = el("div", "screen"), frame = el("iframe");
  Object.assign(frame, {
    src: `${YT}/embed/${id}?rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`, title: x.title,
    allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowFullscreen: true,
    referrerPolicy: "strict-origin-when-cross-origin",   // YouTube refuses to play for a page that sends no referrer
  });
  frame.onload = () => frame.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), YT);
  screen.append(frame);
  player.replaceChildren(screen, el("div", "now"));
  showNow();
  win.classList.add("playing");
  fillClassList();
  list.querySelector("[aria-current]")?.scrollIntoView({ block: "nearest" });
  if (!first || calm.matches) return;
  const to = list.getBoundingClientRect(), ease = "cubic-bezier(.22,.61,.36,1)";
  list.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: "none" }], { duration: 900, easing: ease });
  player.animate([{ opacity: 0, transform: "translateX(28px)" }, { opacity: 1, transform: "none" }], { duration: 900, delay: 150, easing: ease, fill: "backwards" });
}

/* Under the video: what is playing, and its notes. */
function showNow() {
  const c = courses[course], now = win.querySelector(".now"), x = playing && c.batches[playing.b]?.classes[playing.i];
  if (!now || !x) return;
  const text = el("div");
  text.append(el("p", "label", [c.batches.length > 1 && c.batches[playing.b].name, x.module].filter(Boolean).join(" · ") || c.name), auto(el("h3", "", x.title)));
  now.replaceChildren(text);
  if (linkHost(x.notes || "")) now.append(notesLink(x.notes));
}

/* ---- adding and changing classes ---- */

const classEditor = $("class-editor"), classForm = $("class-form"), which = classForm.elements.which;
const modulePick = classForm.elements.module, newModule = classForm.elements["new-module"];
let editingClass = -1;

/* The last choice, "New module…", opens a box for its name. */
function showNewModule() {
  newModule.hidden = modulePick.selectedIndex !== modulePick.length - 1;
  newModule.required = !newModule.hidden;
}
modulePick.onchange = () => { showNewModule(); if (!newModule.hidden) newModule.focus(); };

function openClassEditor(i = -1) {
  const c = courses[course], b = c.batches[batch];
  which.replaceChildren(new Option("A new class", -1), ...b.classes.map((x, j) => new Option(`${j + 1}. ${x.title}`, j)));
  which.value = i;
  $("class-batches").replaceChildren(...c.batches.map(x => new Option(x.name)));
  modulePick.replaceChildren(new Option("No module", ""), ...[...new Set(classesOf(c).map(x => x.module).filter(Boolean))].map(m => new Option(m)), new Option("New module…", ""));
  $("class-course").textContent = c.name;
  fillClassForm();
  classEditor.showModal();
}

function fillClassForm() {
  const b = courses[course].batches[batch], x = b.classes[+which.value];
  editingClass = x ? +which.value : -1;
  for (const k of ["title", "url", "notes", "module", "tag"]) classForm.elements[k].value = x?.[k] || "";
  classForm.elements.batch.value = b.name;
  if (!x) modulePick.value = b.classes.at(-1)?.module || "";
  newModule.value = "";
  showNewModule();
  $("class-form-title").textContent = x ? "Change a class" : "Add a class";
  $("class-remove").hidden = !x;
  $("class-error").textContent = "";
  dirty = false;
}

/* Saves the course as `next`, then shows the batch named `to`; a class that
   was playing stays marked wherever it now stands. */
async function saveClasses(next, to) {
  const btn = $("class-save"), was = playing && courses[course].batches[playing.b]?.classes[playing.i]?.url;
  btn.disabled = true;
  $("class-error").textContent = "";
  try {
    await saveCourse(next);
  } catch (err) {
    $("class-error").textContent = err.message;   // the form stays open, so nothing typed is lost
    return;
  } finally {
    btn.disabled = false;
  }
  const c = courses[course];
  batch = Math.max(0, c.batches.findIndex(b => b.name === to));
  playing = null;
  c.batches.forEach((b, bi) => { const i = b.classes.findIndex(x => x.url === was); if (was && i >= 0 && !playing) playing = { b: bi, i }; });
  dirty = false;
  classEditor.close();
  fillClassList();
  showNow();
}

which.onchange = () => { if (discard()) fillClassForm(); else which.value = editingClass; };
classForm.addEventListener("input", e => { if (e.target !== which) dirty = true; });
classForm.addEventListener("submit", e => {
  e.preventDefault();
  const b = courses[course].batches[batch], old = b.classes[editingClass], x = {};
  const module = (newModule.hidden ? modulePick : newModule).value.trim();
  if (module) x.module = module;
  for (const k of ["title", "url", "tag", "notes"]) {
    const v = classForm.elements[k].value.trim();
    if (v) x[k] = v;
  }
  if (old?.date) x.date = old.date;
  const to = classForm.elements.batch.value.trim() || b.name;
  saveClasses(placeClass(courses[course], batch, editingClass, x, to), to);
});
$("class-remove").onclick = () => {
  const b = courses[course].batches[batch], x = b.classes[editingClass];
  if (!x || !confirm(`Remove “${x.title}” from ${b.name}?`)) return;
  saveClasses(placeClass(courses[course], batch, editingClass, null, b.name), b.name);
};
$("class-cancel").onclick = () => { if (discard()) classEditor.close(); };
classEditor.addEventListener("cancel", e => { if (!discard()) e.preventDefault(); });

$("class-pen").onclick = () => openClassEditor(playing?.b === batch ? playing.i : -1);
$("resource-pen").onclick = () => {
  const c = courses[course], at = batch;
  openLinkEditor(`${c.name} · ${c.batches[at].name}`, [{ name: "", links: c.batches[at].resources || [] }], false, async groups => {
    const next = structuredClone(courses[course]);
    next.batches[at].resources = groups[0]?.links || [];
    await saveCourse(next);
    fillClassList();
  });
};

fetchOwn("classes").then(d => {
  courses = Array.isArray(d?.courses) ? d.courses : [];
  for (const x of courses) {   // resources kept for a whole course, before batches had their own, go to its newest batch
    if (x.resources?.length && x.batches?.length) x.batches.at(-1).resources = [...(x.batches.at(-1).resources || []), ...x.resources];
    delete x.resources;
  }
  const c = courses[course];
  if (!c || !Array.isArray(c.batches) || !c.batches.length) { $("nothing").hidden = false; return; }
  document.title = `${c.name} · Saeed's archive`;
  batch = ask.has("b") && c.batches[+ask.get("b")] ? +ask.get("b") : c.batches.length - 1;
  $("course-name").textContent = c.name;
  $("course-teacher").textContent = c.teacher || "";
  $("course-teacher").hidden = !c.teacher;
  win.hidden = $("tools").hidden = false;
  fillClassList();
  if (!calm.matches) win.animate([{ opacity: 0, transform: "translateY(30px)" }, { opacity: 1, transform: "none" }], { duration: 900, easing: "cubic-bezier(.22,.61,.36,1)" });
  if (ask.has("i")) playClass(+ask.get("i"));
});
