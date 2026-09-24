# JANSAHYOG — Production Ready Setup

This repository contains the JANSAHYOG collaboration platform (frontend + backend). The backend supports an optional MongoDB persistent store and JWT-based authentication. When MongoDB is not configured, the app falls back to a local JSON file store for demo and tests.

Quick start (development / tests):

1. Install dev dependencies and run tests:

```bash
npm install
npm test
```

2. Run locally (file-backed demo):

```bash
npm run server
# open http://localhost:3000 (vite dev) or run `npm run dev` for full stack
```

Production (Docker + Mongo):

1. Copy `.env.example` to `.env` and update secrets.
2. Build and start with docker-compose:

```bash
docker compose up --build -d
```

This starts a MongoDB service and the Node app. The app will connect to MongoDB at `MONGO_URI` and persist users, challenges, and solutions into collections.

Alternatively, run the Node server directly in production mode on the host (ensure env vars set):

```bash
# Linux / macOS
NODE_ENV=production MONGO_URI="mongodb://localhost:27017" MONGO_DB_NAME=jansahyog JWT_SECRET="<secure-random>" npm run start:prod

# Windows (PowerShell)
$env:MONGO_URI = 'mongodb://localhost:27017'; $env:MONGO_DB_NAME = 'jansahyog'; $env:JWT_SECRET = '<secure-random>'; $env:NODE_ENV='production'; npm run start:prod
```

Security & notes
- JWT secret must be set in production (`JWT_SECRET`).
- Change default rate limits and file upload size as needed.
- Uploaded files are stored in `./uploads` and served under `/uploads` when `multer` is installed.

Free deployment on Render
1. Push this repo to GitHub.
2. In Render, choose New > Web Service > Connect GitHub repo.
3. Use the repo and select the Node runtime.
4. Use the following settings:
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run start:prod`
   - Add env vars: `NODE_ENV=production`, `PORT=3001`, `JWT_SECRET=<secure-secret>`, `MONGO_DB_NAME=jansahyog`
   - Set `MONGO_URI` only if you want MongoDB persistence.
5. Deploy.

This repository already includes a Render config file at `render.yaml` for a quick free deployment setup.
