# location-track-server

Backend for the consent-based real-time location tracking web application.

## Tech Stack

- Node.js
- Express.js
- Socket.IO
- dotenv, cors, helmet, express-rate-limit
- Node `crypto` for secure random tracking tokens

## Features

- Create / validate / deactivate temporary tracking links
- Real-time location via Socket.IO (no REST polling)
- Admin live tracking broadcasts
- In-memory data structures (Map) — no external database
- Helmet, CORS, rate limiting, server-side token & coordinate validation
- No arbitrary room joining — socket session is validated server-side

## How to run locally

```bash
npm install
npm run dev      # nodemon (development)
# or
npm start        # node (production)
```

Default port: `5000`

## Environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable      | Description |
|---------------|-------------|
| `PORT`        | Server port (default 5000) |
| `CLIENT_URL`  | Frontend origin (CORS + Socket.IO). e.g. `http://localhost:5173` |
| `ADMIN_KEY`   | Shared admin key used by the admin panel (`x-admin-key` header) |

> `.env` is gitignored — never commit it.

## API endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/admin/tracking-links` | `x-admin-key` | Create tracking link |
| GET | `/api/admin/tracking-links` | `x-admin-key` | List active links |
| GET | `/api/tracking/:token` | - | Validate token |
| POST | `/api/admin/tracking-links/:id/deactivate` | `x-admin-key` | Deactivate link |

## Socket.IO events

- `tracking:join` `{ token }` → validates token, joins room
- `location:update` `{ latitude, longitude, accuracy, timestamp }` → validates + broadcasts `location:updated`
- `tracking:stop` → mark session stopped
- `admin:join` `{ trackingId }` → admin joins live room

## Important

- All data is kept in server memory (`Map`s). It is **lost on server restart**.
- No database. MongoDB can be added later without rewriting the Socket.IO architecture.
