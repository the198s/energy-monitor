# Energy Monitor — Deployment Guide

A personal UK energy deal tracker that searches MSE, Uswitch and supplier sites in real time and compares deals against your exact usage.

---

## What you need before starting
- Node.js installed on your computer ✅
- A GitHub account ✅  
- A Vercel account ✅
- An Anthropic API key (free to get — see Step 1)

---

## Step 1 — Get your Anthropic API key

1. Go to **https://console.anthropic.com**
2. Sign in or create a free account
3. Click **"API Keys"** in the left sidebar
4. Click **"Create Key"**, give it a name like "energy-monitor"
5. Copy the key — it starts with `sk-ant-...`
6. Keep this tab open, you'll need it shortly

---

## Step 2 — Set up the project on your computer

Open **Terminal** (on Mac: press Cmd+Space, type "Terminal", press Enter).

Type these commands one at a time, pressing Enter after each:

```
cd Desktop
```

Now unzip the project folder you downloaded and move it to your Desktop.
Then run:

```
cd energy-monitor
npm install
```

This will take about 30 seconds and install everything needed.

---

## Step 3 — Add your API key

In the project folder, find the file called `.env.local` and open it in any text editor (TextEdit on Mac, Notepad on Windows).

Replace `your_api_key_here` with your actual key:

```
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
```

Save the file.

---

## Step 4 — Test it locally (optional but recommended)

In Terminal, run:

```
npm run dev
```

Then open your browser and go to **http://localhost:3000**

You should see the Energy Monitor app. Click "Search market now" to test it.

Press Ctrl+C in Terminal when done.

---

## Step 5 — Put it on GitHub

1. Go to **https://github.com** and sign in
2. Click the **+** button (top right) → **New repository**
3. Name it `energy-monitor`
4. Leave everything else as default, click **"Create repository"**
5. GitHub will show you some commands. Copy and run these in Terminal (in your energy-monitor folder):

```
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/energy-monitor.git
git push -u origin main
```

(Replace YOUR-USERNAME with your actual GitHub username)

---

## Step 6 — Deploy to Vercel

1. Go to **https://vercel.com** and sign in
2. Click **"Add New Project"**
3. Click **"Import"** next to your `energy-monitor` repository
4. Leave all settings as default — Vercel detects Next.js automatically
5. **Before clicking Deploy**, click **"Environment Variables"**
6. Add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your `sk-ant-...` key
7. Click **"Deploy"**

Vercel will build and deploy in about 60 seconds.

---

## Step 7 — You're live!

Vercel gives you a URL like `energy-monitor-abc123.vercel.app`

Bookmark it. Open it on your phone. Use it whenever you want to check the market.

---

## Updating your benchmarks

When you switch to a new deal, update the benchmarks in `app/api/search/route.js` and `app/page.js`:

Find this section and change the numbers:
```js
benchmarks: {
  outfox: { name: "Outfox Fix'd 12M", cost: 1649, exitFee: 150 },
  eon:    { name: "E.ON Next 13M V9", cost: 1687, exitFee: 100 },
},
```

Then push to GitHub and Vercel redeploys automatically.

---

## Troubleshooting

**"npm: command not found"** — Node.js isn't in your PATH. Restart Terminal after installing Node.

**"Module not found"** — Run `npm install` again.

**API errors in the app** — Check your API key is correct in Vercel's Environment Variables settings.

**Vercel build fails** — Check the build logs in Vercel's dashboard for the specific error.
