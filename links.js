/* Saeed's Archive — the links page: links kept in named groups, each opening
   in a new tab. The pen adds or changes one. */
"use strict";

let groups = [];
signedOut = () => "You were signed out. Sign in again on the home page, then save here: nothing you typed is lost.";

function showLinks() {
  $("link-count").textContent = count(groups.reduce((n, g) => n + g.links.length, 0), "link");
  const out = el("ol", "modules");
  for (const g of groups) {
    const li = el("li", "module"), ol = el("ol", "lessons");
    for (const x of g.links) {
      const row = el("li", "lesson"), a = outLink(x.url, "lesson-title");
      a.append(auto(el("span", "lesson-text", x.title)), el("span", "label link-host", linkHost(x.url)));
      row.append(a);
      ol.append(row);
    }
    if (g.name) li.append(auto(el("h3", "label module-name", g.name)));
    li.append(ol);
    out.append(li);
  }
  $("link-list").replaceChildren(groups.length ? out : el("p", "label class-empty", "No links yet. Press the pen to add the first."));
}

$("link-pen").onclick = () => openLinkEditor("Links", groups, true, async next => {
  groups = (await send({ op: "links", groups: next })).groups;
  showLinks();
});

fetchOwn("links").then(d => {
  if (!Array.isArray(d?.groups)) { $("nothing").hidden = false; return; }
  groups = d.groups;
  $("links-window").hidden = $("tools").hidden = false;
  showLinks();
  if (!calm.matches) $("links-window").animate([{ opacity: 0, transform: "translateY(30px)" }, { opacity: 1, transform: "none" }], { duration: 900, easing: "cubic-bezier(.22,.61,.36,1)" });
});
