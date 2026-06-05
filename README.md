# Expense Tracker

Full-stack expense tracker using Google Sheets as the database, with a Telegram bot for quick entry and a live dashboard with real-time charts.

---

## Stack

- **Frontend** — Vanilla HTML/CSS/JS + Chart.js
- **Backend** — Node.js + Express
- **Database** — Google Sheets (via Google Sheets API + service account)
- **Bot** — Telegram (node-telegram-bot-api, webhook mode)
- **Hosting** — Render (free tier)

---

## Step-by-step Setup

### 1. Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Rename the default sheet tab to **`Expenses`** (right-click the tab → Rename).
3. Add these headers in row 1:

   | A    | B    | C        | D            |
   |------|------|----------|--------------|
   | Date | Item | Category | Amount (SGD) |

4. Copy the **Sheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/`**`<SHEET_ID>`**`/edit`

---

### 2. Create a Google Cloud Service Account

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a new project (or select an existing one).
3. Enable the **Google Sheets API**:
   - Navigate to **APIs & Services → Library**
   - Search for "Google Sheets API" and click **Enable**
4. Create a service account:
   - Go to **APIs & Services → Credentials**
   - Click **Create Credentials → Service Account**
   - Give it a name (e.g. `expense-tracker`) and click **Done**
5. Download the JSON key:
   - Click on the service account you just created
   - Go to the **Keys** tab → **Add Key → Create new key → JSON**
   - Save the downloaded file as **`credentials.json`** in the project root

---

### 3. Share the Google Sheet with the Service Account

1. Open the `credentials.json` file and copy the `client_email` value
   (it looks like `expense-tracker@your-project.iam.gserviceaccount.com`)
2. Open your Google Sheet → click **Share**
3. Paste the service account email and set role to **Editor** → click **Send**

---

### 4. Get a Telegram Bot Token

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts (choose a name and username)
3. Copy the bot token — it looks like `123456789:ABCdef...`

---

### 5. Push the Project to GitHub

```bash
cd /path/to/expense-tracker
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/expense-tracker.git
git push -u origin main
```

> **Important:** Add `credentials.json` and `.env` to `.gitignore` before pushing — never commit secrets.

```
# .gitignore
credentials.json
.env
node_modules/
```

---

### 6. Create a Render Account and Deploy

1. Go to [render.com](https://render.com) and sign up for free.
2. Click **New → Web Service**
3. Connect your GitHub account and select the `expense-tracker` repository
4. Render will auto-detect the `render.yaml` — confirm the settings:
   - **Build command:** `npm install`
   - **Start command:** `node server.js`
5. Click **Create Web Service**

---

### 7. Set Environment Variables in Render

In your Render service dashboard, go to **Environment** and add:

| Key | Value |
|-----|-------|
| `GOOGLE_SHEET_ID` | Your Sheet ID from step 1 |
| `TELEGRAM_BOT_TOKEN` | Your bot token from step 4 |
| `GOOGLE_CREDENTIALS_JSON` | The **entire contents** of `credentials.json` as a single-line JSON string |

> **How to get the single-line JSON string:**
> ```bash
> # On Mac/Linux:
> cat credentials.json | tr -d '\n'
> # On Windows PowerShell:
> (Get-Content credentials.json -Raw) -replace '\r?\n',''
> ```
> Paste the output as the value for `GOOGLE_CREDENTIALS_JSON`.

---

### 8. Register the Telegram Webhook

After your Render service is live (you'll see a URL like `https://your-app.onrender.com`), register the webhook by visiting this URL in your browser:

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-app.onrender.com/telegram-webhook
```

You should see: `{"ok":true,"result":true,"description":"Webhook was set"}`

---

### 9. Run Locally (Website Only)

1. Copy `.env.example` to `.env` and fill in your values:
   ```
   GOOGLE_CREDENTIALS_PATH=./credentials.json
   GOOGLE_SHEET_ID=your_sheet_id_here
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   PORT=3000
   ```
2. Place your `credentials.json` in the project root.
3. Install dependencies and start:
   ```bash
   npm install
   node server.js
   ```
4. Open [http://localhost:3000](http://localhost:3000)

> The Telegram bot will not receive messages locally (webhook requires a public URL). Use [ngrok](https://ngrok.com) to expose localhost if you want to test the bot locally.

---

## Telegram Bot Usage

| Action | Format |
|--------|--------|
| Add expense | `Lunch, Food, 12.50` |
| This month's summary | `/summary` |
| Last 5 entries | `/last5` |
| Delete most recent | `/delete last` |
| Help | `/help` |

Valid categories: `Food`, `Shopping`, `Entertainment`, `Travel`

**Success reply example:**
```
✅ Added: Lunch | Food | $12.50 on 5 Jun 2026
```

---

## Project Structure

```
expense-tracker/
├── server.js           # Express server, Google Sheets API, Telegram bot
├── public/
│   └── index.html      # Frontend dashboard
├── package.json
├── render.yaml         # Render deployment config
├── .env.example        # Environment variable template
└── README.md
```
