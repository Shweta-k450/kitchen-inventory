# Deploying Kitchen Inventory

This app is a normal Next.js web app. Once it's deployed, it works in any
browser — Safari on your phone, Chrome, whatever — with no "desktop app
only" limitation. You'll need three things, all free at this scale:

1. A **GitHub** account, to hold the code
2. A **Firebase** project, for the database (your inventory, grocery list, and recipes)
3. A **Vercel** account, to host the site
4. An **Anthropic API key**, for the AI features (parsing ingredients, estimating nutrition, scanning receipts and photos)

Total time: about 20-30 minutes the first time.

---

## 1. Put the code on GitHub

1. Go to [github.com/new](https://github.com/new) and create a new repository (e.g. `kitchen-inventory`). It can be private.
2. On your own computer, unzip the project folder you were given, then from inside it run:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/kitchen-inventory.git
   git push -u origin main
   ```

   (Replace the URL with the one GitHub shows you after creating the repo.)

---

## 2. Set up Firebase (the database)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and click **Add project**. Give it any name (e.g. "kitchen-inventory"). You can decline Google Analytics — it's not needed.
2. Once the project is created, click the **web icon (`</>`)** on the project overview page to register a new web app. Give it a nickname and click **Register app**. You do NOT need Firebase Hosting.
3. Firebase will show you a `firebaseConfig` object with values like `apiKey`, `authDomain`, `projectId`, etc. Keep this page open — you'll copy these into Vercel in step 4.
4. In the left sidebar, go to **Build -> Firestore Database**, click **Create database**, choose a location close to you, and start in **production mode**.
5. Once created, go to the **Rules** tab and replace the contents with what's in this project's `firestore.rules` file, then click **Publish**. (This opens up the three collections the app uses — items, groceryExtras, recipes — with no login screen. That's intentional for a single-household app; see "Sharing with someone else" below if you want a second, separate household.)

---

## 3. Get an Anthropic API key

1. Go to [platform.claude.com](https://platform.claude.com) and sign in (or create an account).
2. Go to **API Keys** and create a new key. Copy it somewhere safe — you won't be able to see it again.
3. You'll need to add billing details / a small amount of credit for the API to work — the AI features (parsing, nutrition, receipt scanning) use it per-request. Usage at normal household scale is inexpensive (typically well under $1/month), but it isn't covered by Vercel's or Firebase's free tiers, since it's a separate service.

### (Optional) YouTube recipe import

"Add a Recipe → Import from a link" also accepts YouTube links. It reads the video's
description and auto-captions (never the video itself) and has Claude reconstruct the
recipe. This works without any extra setup by scraping the watch page, but a free
YouTube Data API key makes it far more reliable (server-side scraping sometimes hits
YouTube's consent wall):

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in.
2. Top bar → project dropdown → **New Project** (name it anything, e.g. "kitchen-inventory"), then select it.
3. Search bar → **YouTube Data API v3** → open it → **Enable**.
4. Left menu → **APIs & Services → Credentials → + Create credentials → API key**. Copy the key.
5. (Recommended) Click the new key → under **API restrictions** choose **Restrict key** → tick **YouTube Data API v3** → Save. Leave "Application restrictions" as None (it's called server-to-server).
6. Add it as the `YOUTUBE_API_KEY` environment variable in step 4 below.

No billing account is needed — the free quota (10,000 units/day; one video lookup = 1 unit) is far more than a household will ever use. The only per-import cost is the Claude call, ~1–3¢, same as any other link import.

---

## 4. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up (you can sign up directly with your GitHub account, which makes step 2 easier).
2. Click **Add New -> Project**, and import the `kitchen-inventory` GitHub repo you pushed in step 1.
3. Vercel will auto-detect it as a Next.js app — leave the build settings as default.
4. Before clicking Deploy, expand **Environment Variables** and add the following (see `.env.local.example` in the project for the full list):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_FIREBASE_API_KEY` | from your Firebase config |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | from your Firebase config |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | from your Firebase config |
   | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | from your Firebase config |
   | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | from your Firebase config |
   | `NEXT_PUBLIC_FIREBASE_APP_ID` | from your Firebase config |
   | `ANTHROPIC_API_KEY` | the key from step 3 |
   | `YOUTUBE_API_KEY` | *(optional)* the key from step 3's YouTube section — improves YouTube recipe import |

5. Click **Deploy**. After a minute or two, Vercel gives you a live URL like `kitchen-inventory-yourname.vercel.app`.
6. Open that URL on your phone and add it to your home screen (Safari: Share -> Add to Home Screen; Chrome/Android: menu -> Add to Home Screen) so it behaves like an app icon. This works now because it's a real website, not a Claude artifact.

That's it — the site is live, backed by your own Firestore database, and will keep working independent of this conversation.

### Updating the app later

Any time you want to change something, push a new commit to the `main` branch on GitHub — Vercel automatically rebuilds and redeploys within a minute or two. No manual redeploy step needed.

---

## Sharing with your sister (a separate household)

Because this app has no login screen and one Firestore database holds one
household's inventory, the clean way to give your sister her own copy with
her own separate data is to give her an independent deployment:

1. She (or you, on her behalf) creates her **own** Firebase project (step 2 above) — this is what keeps her data completely separate from yours.
2. She creates her **own** Anthropic API key (step 3), or you decide to share a key if you're comfortable splitting the small cost — that's a billing choice, not a technical requirement.
3. Deploy the **same GitHub repo** a second time as a **separate Vercel project** (step 4), pointed at her Firebase project's environment variables instead of yours.

Since it's the same codebase, any improvements you make and push to GitHub can be pulled into her deployment too, but the two apps' data never mixes.

---

## Costs

At normal household usage, this stays within free tiers for hosting and
the database:

- **Vercel free tier**: generous limits for personal projects (bandwidth, build minutes, serverless function usage) — a household inventory app run by a couple of people won't come close.
- **Firebase Firestore free tier ("Spark" plan)**: includes a daily quota of reads/writes/storage that comfortably covers a single household's data.
- **Anthropic API**: pay-as-you-go, billed separately from the above — typically a small fraction of a dollar per month at this scale, but it does require a payment method on file.

If any of these ever needed to scale beyond free-tier limits (which is
very unlikely for personal use), each service would prompt you to upgrade
before anything breaks or gets shut off.
