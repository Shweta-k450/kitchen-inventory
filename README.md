# Kitchen Inventory

A household kitchen tracker: pantry / fridge / freezer / spare-fridge /
spare-freezer inventory, a grocery list, receipt-photo scanning, and a
recipe book with AI-assisted ingredient parsing and nutrition estimates.

Built with Next.js, Firebase Firestore (data), and the Anthropic API (AI
features), deployed on Vercel.

## Deploying this app

See **[DEPLOY.md](./DEPLOY.md)** for the full step-by-step walkthrough
(GitHub, Firebase, Anthropic API key, Vercel) — start there if you're
setting this up for the first time.

## Local development

1. Copy `.env.local.example` to `.env.local` and fill in your Firebase and
   Anthropic credentials (see DEPLOY.md for where to get these).
2. Install dependencies and run the dev server:

   ```bash
   npm install
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000).

Without credentials in `.env.local`, the app still runs, but shows as
"offline" (no data persistence) and AI features report as unavailable —
this is expected and lets you look at the UI without setting anything up.

## Project structure

- `src/components/App.tsx` — the whole client application (screens, state, handlers)
- `src/hooks/useKitchenData.ts` — Firestore data subscriptions and mutations
- `src/lib/` — shared types, constants (categories/locations/stores/seed data), and pure display/matching logic
- `src/app/api/*` — server routes that call the Anthropic API (ingredient parsing, nutrition estimates, receipt and photo scanning)
- `firestore.rules` — Firestore security rules to publish in the Firebase console
