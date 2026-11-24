# ChatApp — Real-Time Chat

A real-time chat application built with **Node.js, Express and Socket.io**, with a web frontend.

## Features

- Live real-time messaging between connected users
- Active user count shown on the frontend
- Join notifications when a new user connects
- Extra chat features in `features.js`
- Static frontend served from `public/` (`index.html`, `app.js`, `style.css`)
- Standalone client in `client.html`

## Tech Stack

- Node.js + Express 5
- Socket.io 4
- Vanilla JS frontend

## Run Locally

```bash
npm install
node server.js
```

Then open `http://localhost:8080` in your browser.

## Project Structure

```
├── server.js          # Express + Socket.io server
├── features.js        # Extra chat features
├── client.html        # Standalone client page
├── public/
│   ├── index.html     # Chat frontend
│   ├── app.js         # Frontend logic
│   └── style.css      # Styling
├── package.json
└── package-lock.json
```
