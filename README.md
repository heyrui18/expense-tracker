# Expense Tracker

Full-stack personal expense tracker using Google Sheets as the database, with a Telegram bot for quick entry and a live dashboard with real-time charts.

**Live demo:** [expense-tracker-ebv5.onrender.com](https://expense-tracker-ebv5.onrender.com)

---

## Stack

- **Frontend** — Vanilla HTML/CSS/JS + Chart.js
- **Backend** — Node.js + Express
- **Database** — Google Sheets (via Google Sheets API + service account)
- **Bot** — Telegram (node-telegram-bot-api, webhook mode)
- **Hosting** — Render (free tier)

---

## Features

### Dashboard
- **Demo / My Data tabs** — public visitors see realistic simulated data; the owner signs in with a password to access real expenses
- Add, edit, and delete expenses from the dashboard form
- Notes field for extra context on each entry
- 6 categories with colour-coded badges: Food, Shopping, Entertainment, Travel, Wellness, Others
- Real-time updates via Server-Sent Events (SSE) — reflects changes from Telegram instantly

### Data & Charts
- Month Total hero stat with full category breakdown
- Doughnut chart — spending by category
- Cumulative line chart — daily running total for the selected month
- Stacked bar chart — monthly breakdown across the selected year
- All charts update dynamically when switching months; empty states shown when no data exists

### Expense Table
- Sortable columns (Date, Item, Category, Amount)
- Live text search filtering
- Expand / collapse pagination — shows 10 rows by default, expandable in increments or all at once
- Inline edit — prefills the form without losing your place
- Inline delete confirmation — no browser dialogs
- CSV export for the current month view

### Telegram Bot
- Add expenses by sending a message from anywhere
- `/summary`, `/last5`, `/delete last` commands
- Changes reflect on the dashboard in real time

---

## Environment Variables

Set these in your Render dashboard (Environment tab):

| Key | Required | Description |
|-----|----------|-------------|
| `GOOGLE_SHEET_ID` | ✅ | Sheet ID from the Google Sheets URL |
| `GOOGLE_CREDENTIALS_JSON` | ✅ | Full contents of `credentials.json` as a single-line string |
| `ADMIN_PASSWORD` | ✅ | Password for the My Data tab |
| `TELEGRAM_BOT_TOKEN` | Optional | Enables the Telegram bot |
| `TOKEN_SECRET` | Optional | HMAC secret for auth tokens (defaults to a built-in value) |

> **How to get `GOOGLE_CREDENTIALS_JSON` (Windows PowerShell):**
> ```powershell
> (Get-Content credentials.json -Raw) -replace '\r?\n','' | Set-Clipboard
> ```
> **Mac/Linux:**
> ```bash
> cat credentials.json | tr -d '\n'
> ```

---

## Step-by-step Setup

### 1. Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Rename the default tab to **`Expenses`** (right-click the tab → Rename).
3. Add these headers in row 1:

   | A    | B    | C        | D            | E     |
   |------|------|----------|--------------|-------|
   | Date | Item | Category | Amount (SGD) | Notes |

4. Copy the **Sheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/`**`<SHEET_ID>`**`/edit`

---

### 2. Create a Google Cloud Service Account

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create or select a project.
3. Enable the **Google Sheets API** (APIs & Services → Library).
4. Go to **APIs & Services → Credentials → Create Credentials → Service Account**.
5. On the service account page, go to **Keys → Add Key → Create new key → JSON**.
6. Save the downloaded file as `credentials.json` in the project root.

---

### 3. Share the Sheet with the Service Account

1. Copy the `client_email` from `credentials.json`.
2. Open your Google Sheet → Share → paste the email → set role to **Editor**.

---

### 4. Get a Telegram Bot Token (optional)

1. Open Telegram and message **@BotFather**.
2. Send `/newbot` and follow the prompts.
3. Copy the token (e.g. `123456789:ABCdef...`).

---

### 5. Deploy to Render

1. Push this repo to GitHub.
2. Go to [render.com](https://render.com) → **New → Web Service** → connect your repo.
3. Render auto-detects `render.yaml`. Confirm:
   - **Build command:** `npm install`
   - **Start command:** `node server.js`
4. Add all required environment variables (see table above).
5. Click **Create Web Service**.

---

### 6. Register the Telegram Webhook

After the Render service is live:

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-app.onrender.com/telegram-webhook
```

Expected response: `{"ok":true,"result":true,"description":"Webhook was set"}`

---

### 7. Run Locally

1. Copy `.env.example` to `.env` and fill in your values:
   ```
   GOOGLE_CREDENTIALS_PATH=./credentials.json
   GOOGLE_SHEET_ID=your_sheet_id_here
   ADMIN_PASSWORD=your_password_here
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   PORT=3000
   ```
2. Place `credentials.json` in the project root.
3. Install and start:
   ```bash
   npm install
   node server.js
   ```
4. Open [http://localhost:3000](http://localhost:3000)

> The Telegram bot requires a public URL for webhooks. Use [ngrok](https://ngrok.com) to test locally.
> If port 3000 is in use: `npx kill-port 3000` then `node server.js`

---

## Telegram Bot Usage

| Action | Format |
|--------|--------|
| Add expense | `Lunch, Food, 12.50` |
| Add with notes | `Gym, Wellness, 80.00, monthly membership` |
| This month's summary | `/summary` |
| Last 5 entries | `/last5` |
| Delete most recent | `/delete last` |
| Help & category list | `/help` |

**Valid categories:** Food, Shopping, Entertainment, Travel, Wellness, Others

```
Lunch, Food, 12.50
Zara top, Shopping, 45.00
Netflix, Entertainment, 15.98
Flight to KL, Travel, 120.00
Gym, Wellness, 80.00, monthly membership
Parking, Others, 3.50
```

---

## Google Sheet Structure

| Column | Field | Notes |
|--------|-------|-------|
| A | Date | Format: YYYY-MM-DD |
| B | Item | Free text |
| C | Category | Must match a valid category exactly |
| D | Amount (SGD) | Number only, no $ sign |
| E | Notes | Optional free text |

> Do not rename the `Expenses` tab or edit row 1 headers — the app depends on these.

---

## Project Structure

```
expense-tracker/
├── server.js           # Express server, auth, Google Sheets API, Telegram bot
├── public/
│   └── index.html      # Single-page dashboard (HTML/CSS/JS)
├── package.json
├── render.yaml         # Render deployment config
├── .env.example        # Environment variable template
├── .gitignore
└── README.md
```
