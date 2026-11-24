// Huddle frontend. Talks to server.js (original events) + features.js (rooms, typing).
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const PAL = ["#E4572E", "#0B7285", "#B5179E", "#5B8E31", "#C1121F", "#6247AA", "#1D6FA5", "#A15C07"];
const hue = (s) => PAL[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PAL.length];
const fmt = (ts) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const socket = io();
const mk = () => ({ msgs: [], unread: 0, typing: {} });
const S = { me: null, active: "lobby", online: [], rooms: {}, scopes: { lobby: mk() } };
const scope = (k) => (S.scopes[k] ||= mk());

let toastT;
function toast(t) {
  const n = $("#toast"); n.textContent = t; n.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => n.classList.remove("show"), 3500);
}
function avatar(name, color) { const a = el("span", "av", name[0].toUpperCase()); a.style.background = color; return a; }

/* ---------- joining ---------- */
$("#name").value = localStorage.getItem("huddle-name") || "";
const uid = sessionStorage.getItem("huddle-uid") || crypto.randomUUID();
sessionStorage.setItem("huddle-uid", uid);

$("#gate-form").onsubmit = (e) => {
  e.preventDefault();
  socket.emit("user:join", { name: $("#name").value, uid }, (res) => {
    if (!res.ok) return ($("#gate-err").textContent = res.error);
    localStorage.setItem("huddle-name", res.me.name);
    S.me = res.me; scope("lobby").msgs.push(...res.lobby);
    $("#gate").hidden = true; $("#app").hidden = false;
    renderAll(true); $("#text").focus();
  });
};

// after a dropped connection: sign in again and re-enter our rooms
socket.on("connect", () => {
  if (!S.me) return;
  socket.emit("user:join", { name: S.me.name, uid }, () => {
    for (const code of Object.keys(S.rooms)) {
      socket.emit("room:join", { code }, (r) => { if (!r.ok) { delete S.rooms[code]; if (S.active === code) go("lobby"); renderSide(); } });
    }
  });
  toast("Back online");
});
socket.on("disconnect", () => toast("Connection lost. Trying to reconnect..."));

/* ---------- events from the original backend ---------- */
socket.on("announce", (t) => toast(t));                       // io.emit("announce")
socket.on("join", (t) => pushSys("lobby", t));                // broadcast "New User Joined"
socket.on("chat", (t) => pushSys("lobby", `Server: ${t}`));   // greeting on connect

/* ---------- events from features.js ---------- */
socket.on("presence", ({ users }) => { S.online = users; if (S.me) { renderSide(); renderHeader(); renderPeople(); } });
socket.on("message", (m) => {
  const s = scope(m.scope);
  s.msgs.push(m); if (s.msgs.length > 200) s.msgs.shift();
  delete s.typing[m.name];
  if (m.scope === S.active) { renderFeed(m.userId === S.me.id); renderTyping(); } else { s.unread++; renderSide(); }
});
socket.on("system", ({ scope: k, text }) => pushSys(k, text));
socket.on("room:update", (info) => { S.rooms[info.code] = info; renderSide(); renderHeader(); renderPeople(); });
socket.on("typing", ({ scope: k, name, isTyping }) => {
  const s = scope(k);
  clearTimeout(s.typing[name]); delete s.typing[name];
  if (isTyping) s.typing[name] = setTimeout(() => { delete s.typing[name]; if (k === S.active) renderTyping(); }, 4000);
  if (k === S.active) renderTyping();
});

function pushSys(k, text) {
  const s = scope(k);
  s.msgs.push({ sys: true, text, ts: Date.now() });
  if (S.me && k === S.active) renderFeed(false);
}

/* ---------- sending + typing indicator ---------- */
let typingOn = false, typingT;
function stopTyping() {
  clearTimeout(typingT);
  if (typingOn) { typingOn = false; socket.emit("typing", { scope: S.active, isTyping: false }); }
}
$("#text").addEventListener("input", () => {
  if (!typingOn) { typingOn = true; socket.emit("typing", { scope: S.active, isTyping: true }); }
  clearTimeout(typingT); typingT = setTimeout(stopTyping, 1500);
});
$("#composer").onsubmit = (e) => {
  e.preventDefault();
  const text = $("#text").value.trim();
  if (!text) return;
  socket.emit("message", { scope: S.active, text });
  $("#text").value = ""; stopTyping();
};

/* ---------- navigation ---------- */
function go(k) {
  stopTyping();
  S.active = k; scope(k).unread = 0;
  $("#side").classList.remove("open");
  renderAll(true); $("#text").focus();
}
$("#menu").onclick = () => $("#side").classList.toggle("open");

/* ---------- rooms dialog ---------- */
const dlg = $("#dlg");
$("#open-dlg").onclick = () => { $("#dlg-err").textContent = ""; $("#side").classList.remove("open"); dlg.showModal(); $("#room-name").focus(); };
$("#close-dlg").onclick = () => dlg.close();
const enterRoom = (res) => {
  if (!res.ok) return ($("#dlg-err").textContent = res.error);
  S.rooms[res.room.code] = res.room;
  scope(res.room.code).msgs = [...res.history];
  $("#room-name").value = ""; $("#room-code").value = "";
  dlg.close(); go(res.room.code);
};
$("#create-form").onsubmit = (e) => { e.preventDefault(); socket.emit("room:create", { name: $("#room-name").value }, enterRoom); };
$("#join-form").onsubmit = (e) => { e.preventDefault(); socket.emit("room:join", { code: $("#room-code").value }, enterRoom); };

function leaveRoom(code) {
  socket.emit("room:leave", code);
  delete S.rooms[code]; delete S.scopes[code];
  go("lobby");
}

/* ---------- rendering ---------- */
function renderAll(force) { renderSide(); renderHeader(); renderFeed(force); renderTyping(); renderPeople(); }

function renderSide() {
  $("#me-name").textContent = S.me.name;
  const me = $("#me-av"); me.textContent = S.me.name[0].toUpperCase(); me.style.background = S.me.color;
  const list = $("#side-list"); list.replaceChildren();
  const item = (k, tile, color, title, sub) => {
    const b = el("button", "item" + (S.active === k ? " on" : ""));
    const t = el("span", "av", tile); t.style.background = color;
    const txt = el("span", "txt"); txt.append(el("b", "", title), el("small", "", sub));
    b.append(t, txt);
    const u = scope(k).unread; if (u) b.append(el("span", "badge", u > 99 ? "99+" : u));
    b.onclick = () => go(k);
    return b;
  };
  list.append(item("lobby", "#", "#151A3B", "Lobby", `${S.online.length} online`));
  list.append(el("h2", "", "Your rooms"));
  const codes = Object.keys(S.rooms);
  if (!codes.length) list.append(el("p", "none", "No rooms yet. Create one or join with a code."));
  for (const c of codes) {
    const r = S.rooms[c];
    list.append(item(c, r.name[0].toUpperCase(), hue(c), r.name, `${r.members.length} ${r.members.length === 1 ? "person" : "people"}`));
  }
}

function renderHeader() {
  const act = $("#head-actions"); act.replaceChildren();
  if (S.active === "lobby") {
    $("#title").textContent = "Lobby";
    $("#sub").textContent = `${S.online.length} online. Everyone on Huddle can read this.`;
    return;
  }
  const r = S.rooms[S.active]; if (!r) return;
  $("#title").textContent = r.name;
  $("#sub").textContent = r.members.map((m) => m.name).join(", ");
  const chip = el("button", "code"); chip.title = "Copy room code";
  chip.append(el("b", "", r.code), el("small", "", "Copy code"));
  chip.onclick = () => { navigator.clipboard?.writeText(r.code); toast(`Code ${r.code} copied. Share it to invite people.`); };
  const leave = el("button", "leave", "Leave"); leave.onclick = () => leaveRoom(r.code);
  act.append(chip, leave);
}

function renderFeed(force) {
  const f = $("#feed");
  const near = f.scrollHeight - f.scrollTop - f.clientHeight < 140;
  f.replaceChildren();
  const msgs = scope(S.active).msgs;
  if (!msgs.length) f.append(el("p", "empty", S.active === "lobby" ? "Nobody has spoken yet. Say hello to everyone." : "This room is quiet. Copy the code above and invite your people."));
  let prev = null;
  for (const m of msgs) {
    if (m.sys) { f.append(el("div", "sys", m.text)); prev = null; continue; }
    const mine = m.userId === S.me.id;
    const same = prev && prev.userId === m.userId && m.ts - prev.ts < 120000;
    const row = el("div", "row" + (mine ? " mine" : "") + (same ? " same" : ""));
    const bub = el("div", "bubble");
    if (!mine && !same) { const w = el("div", "who", m.name); w.style.color = m.color; bub.append(w); }
    bub.append(el("p", "", m.text), el("time", "", fmt(m.ts)));
    row.append(avatar(m.name, m.color), bub);
    f.append(row); prev = m;
  }
  if (force || near) f.scrollTop = f.scrollHeight;
}

function renderTyping() {
  const names = Object.keys(scope(S.active).typing);
  const box = $("#typing"); box.replaceChildren();
  if (!names.length) return;
  const dots = el("span", "dots"); dots.append(el("i"), el("i"), el("i"));
  const who = names.length > 2 ? "Several people are" : names.join(" and ") + (names.length === 1 ? " is" : " are");
  box.append(dots, el("span", "", `${who} typing`));
}

function renderPeople() {
  const ul = $("#people-list"); ul.replaceChildren();
  const inRoom = S.active !== "lobby" && S.rooms[S.active];
  const people = inRoom ? S.rooms[S.active].members : S.online;
  $("#people-h").textContent = inRoom ? `In this room (${people.length})` : `Online now (${people.length})`;
  for (const p of people) {
    const li = el("li"); li.append(avatar(p.name, p.color), el("span", "", p.name));
    if (p.id === S.me.id) li.append(el("small", "", "you"));
    ul.append(li);
  }
}
