# CareerUS Compliance CRM (Desktop)

Windows desktop app for the CareerUS Compliance CRM. It uses the same UI, logic, and MongoDB-backed API as the website.

## API

Production API (shared with the website):

```text
https://cus-compliance-crm.vercel.app
```

Optional local override — copy `.env.example` to `.env`:

```bash
VITE_API_BASE_URL=https://cus-compliance-crm.vercel.app
```

## Prerequisites

- Node.js 20.19+ or 22.12+
- Rust (MSVC toolchain on Windows)
- Visual Studio C++ Build Tools / Windows SDK
- WebView2

## Develop

```bash
cd cus-compliance-software
npm install
npm run tauri dev
```

## Build installer

```bash
npm run tauri build
```

Windows NSIS installer output (typical local path):

```text
src-tauri/target/release/bundle/nsis/CareerUS Compliance CRM_0.1.0_x64-setup.exe
```

A successful local build also produces the app executable under `src-tauri/target/release/`.

## Scripts

```bash
npm run dev      # Vite only
npm run build    # frontend production build
npm run test     # unit tests
npm run tauri    # Tauri CLI
```

## GitHub notes

Commit source, lockfiles, icons, and `.env.example`.

Do **not** commit:

- `.env` / secrets
- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `.exe` / `.msi` installers
