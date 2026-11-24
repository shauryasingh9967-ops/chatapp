// features.js — ADDED on top of the class backend (server.js logic is not changed)
// Extra feature 1: Private rooms (create / join with a 5-letter code, many users per room)
// Extra feature 2: Typing indicator ("Asha is typing...")
// Also: nicknames, lobby chat, online presence.
const crypto = require("crypto");

const COLORS = ["#E4572E", "#0B7285", "#B5179E", "#5B8E31", "#C1121F", "#6247AA", "#1D6FA5", "#A15C07"];
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion

module.exports = (io) => {
  const users = new Map(); // socket.id -> { id, name, color, sid }
  const rooms = new Map(); // code -> { code, name, owner, members:Set(socket.id), history:[] }
  const lobbyHistory = [];

  const clean = (v, max) => String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
  const colorFor = (name) => COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  const publicUser = (u) => ({ id: u.id, name: u.name, color: u.color });
  const keep = (arr, m) => { arr.push(m); if (arr.length > 100) arr.shift(); return m; };
  const makeMsg = (u, scope, text) => ({
    id: crypto.randomUUID(), scope, userId: u.id, name: u.name, color: u.color, text, ts: Date.now(),
  });
  const roomInfo = (r) => ({
    code: r.code, name: r.name,
    members: [...r.members].map((sid) => users.get(sid)).filter(Boolean).map(publicUser),
  });
  const makeCode = () => {
    let c;
    do { c = Array.from({ length: 5 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join(""); }
    while (rooms.has(c));
    return c;
  };
  const sendPresence = () =>
    io.emit("presence", { users: [...users.values()].map(publicUser) });

  // a second connection listener: Socket.IO runs both, so the original one keeps working
  io.on("connection", (socket) => {
    let me = null;

    const addToRoom = (r) => {
      r.members.add(socket.id);
      socket.join(r.code);
    };
    const leaveRoom = (code) => {
      const r = rooms.get(code);
      if (!r || !me || !r.members.has(socket.id)) return;
      r.members.delete(socket.id);
      socket.leave(code);
      if (r.members.size === 0) return void rooms.delete(code); // empty room disappears
      io.to(code).emit("room:update", roomInfo(r));
      io.to(code).emit("system", { scope: code, text: `${me.name} left the room` });
    };

    socket.on("user:join", (data, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const name = clean(data && data.name, 20);
      if (name.length < 2) return reply({ ok: false, error: "Use a name with at least 2 characters." });
      me = { id: clean(data.uid, 40) || socket.id, name, color: colorFor(name) };
      users.set(socket.id, me);
      socket.join("lobby");
      reply({ ok: true, me: publicUser(me), lobby: lobbyHistory });
      sendPresence();
    });

    socket.on("room:create", (data, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      if (!me) return reply({ ok: false, error: "Enter your name first." });
      const r = { code: makeCode(), name: clean(data && data.name, 24) || `${me.name}'s room`, members: new Set(), history: [] };
      rooms.set(r.code, r);
      addToRoom(r);
      reply({ ok: true, room: roomInfo(r), history: [] });
    });

    socket.on("room:join", (data, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      if (!me) return reply({ ok: false, error: "Enter your name first." });
      const code = clean(data && data.code, 8).toUpperCase();
      const r = rooms.get(code);
      if (!r) return reply({ ok: false, error: `No room with code ${code || "(empty)"}. Check the code and try again.` });
      const already = r.members.has(socket.id);
      addToRoom(r);
      if (!already) {
        io.to(code).emit("room:update", roomInfo(r));
        socket.to(code).emit("system", { scope: code, text: `${me.name} joined the room` });
      }
      reply({ ok: true, room: roomInfo(r), history: r.history });
    });

    socket.on("room:leave", (code) => leaveRoom(code));

    // one event for both lobby and rooms: scope is "lobby" or a room code
    socket.on("message", (data) => {
      if (!me || !data) return;
      const text = String(data.text || "").trim().slice(0, 1000);
      if (!text) return;
      if (data.scope === "lobby") {
        io.to("lobby").emit("message", keep(lobbyHistory, makeMsg(me, "lobby", text)));
      } else {
        const r = rooms.get(data.scope);
        if (!r || !r.members.has(socket.id)) return;
        io.to(r.code).emit("message", keep(r.history, makeMsg(me, r.code, text)));
      }
    });

    socket.on("typing", (data) => {
      if (!me || !data) return;
      const room = data.scope === "lobby" ? "lobby" : data.scope;
      if (room !== "lobby" && !(rooms.get(room) || { members: new Set() }).members.has(socket.id)) return;
      socket.to(room).emit("typing", { scope: data.scope, name: me.name, isTyping: !!data.isTyping });
    });

    socket.on("disconnect", () => {
      if (!me) return;
      [...rooms.keys()].forEach(leaveRoom);
      users.delete(socket.id);
      sendPresence();
    });
  });
};
