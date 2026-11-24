// npm init -y, npm i express socket.io
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const httpserver = http.createServer(app);

const io = new Server(httpserver);

// ---- ADDED: frontend + extra features (existing code below is untouched) ----
app.use(express.static(require("path").join(__dirname, "public")));
require("./features")(io);
// ---------------------------------------------------------------------------

// To manage Active user count
let count = 0;

io.on("connection", (socket) => {
  count++;
  console.log("Active User: ", count); // terminal/backend
  socket.emit("active", count); // frontend/client

  console.log("Connected Established");

  socket.emit("chat", "Hello from server side");

  // To broadcast a message
  socket.broadcast.emit("join", "New User Joined");

  socket.on("msg", (cb) => {
    console.log(cb);
  });

  // handling disconnect event
  socket.on("disconnect", () => {
    count--;
    console.log("Active User: ", count); // terminal/backend
  });

  // For making announcement
  io.emit("announce", "Only 5hr class left");
});

httpserver.listen(8080, () => {
  console.log("Server started");
});
