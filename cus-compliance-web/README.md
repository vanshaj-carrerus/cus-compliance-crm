# CUS Compliance Web

Next.js Compliance CRM with MongoDB, email verification login, and a shared API used by the desktop app.

## Getting started

```bash
cd cus-compliance-web
npm install
cp .env.local.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Required environment variables

See [`.env.local.example`](.env.local.example):

- `MONGODB_URI`
- `JWT_SECRET`
- `ALLOWED_EMAILS`
- `EMAIL_USER`
- `EMAIL_PASS`
- optional `CORS_ALLOWED_ORIGINS`

## Desktop API support

Auth routes return bearer tokens for the Tauri desktop client while browsers continue using HTTP-only cookies:

- `verifiedToken` from `/api/auth/verify-code`
- `sessionToken` from `/api/auth/login` and `/api/auth/set-password`
- `Authorization: Bearer <sessionToken>` accepted on protected APIs

Deployed production URL:

```text
https://cus-compliance-crm.vercel.app
```

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Deploy (Vercel)

Set the project root to `cus-compliance-web` and configure the environment variables above. After auth/CORS changes, redeploy before testing the desktop app.
