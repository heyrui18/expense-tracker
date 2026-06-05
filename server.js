require('dotenv').config();

const express = require('express');
const { google } = require('googleapis');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Expenses';
const CATEGORIES = ['Food', 'Shopping', 'Entertainment', 'Travel'];

// ── Google Sheets auth ──────────────────────────────────────────────────────
function getAuthClient() {
  // On Render, credentials are stored as a JSON string in env var
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  // Locally, use a credentials file
  return new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheetsClient() {
  const auth = getAuthClient();
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function sgtToday() {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' })
  )
    .toLocaleDateString('en-GB') // DD/MM/YYYY
    .split('/')
    .reverse()
    .join('-'); // YYYY-MM-DD
}

function formatDateForReply(dateStr) {
  // dateStr is YYYY-MM-DD
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

async function getAllRows() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A2:D`,
  });
  return res.data.values || [];
}

// ── SSE: push updates to connected browsers ──────────────────────────────────
const sseClients = [];

function broadcastSSE(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => res.write(payload));
}

// Poll every 10 seconds
let lastSnapshot = '';
setInterval(async () => {
  try {
    const rows = await getAllRows();
    const snapshot = JSON.stringify(rows);
    if (snapshot !== lastSnapshot) {
      lastSnapshot = snapshot;
      broadcastSSE(rows);
    }
  } catch (_) {}
}, 10000);

app.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  sseClients.push(res);
  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// ── REST endpoints ───────────────────────────────────────────────────────────
app.get('/expenses', async (req, res) => {
  try {
    const rows = await getAllRows();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/add-expense', async (req, res) => {
  const { date, item, category, amount } = req.body;
  if (!date || !item || !category || amount === undefined) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }
  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:D`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[date, item, category, parseFloat(amount)]] },
    });
    const rows = await getAllRows();
    broadcastSSE(rows);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/delete-expense', async (req, res) => {
  const { rowIndex } = req.body; // 0-based index into data rows (row 2 onwards in sheet)
  if (rowIndex === undefined) {
    return res.status(400).json({ error: 'Missing rowIndex' });
  }
  try {
    const sheets = await getSheetsClient();
    // Get spreadsheet to find the sheet ID (numeric)
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const sheet = meta.data.sheets.find(
      s => s.properties.title === SHEET_NAME
    );
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });

    const sheetId = sheet.properties.sheetId;
    const startIndex = rowIndex + 1; // +1 because row 0 is the header

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex,
                endIndex: startIndex + 1,
              },
            },
          },
        ],
      },
    });
    const rows = await getAllRows();
    broadcastSSE(rows);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Telegram Bot ─────────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
let bot;

if (BOT_TOKEN) {
  bot = new TelegramBot(BOT_TOKEN);

  app.post('/telegram-webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  // Set webhook (called once after deploy — harmless to call on every start)
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
  if (RENDER_URL) {
    bot.setWebHook(`${RENDER_URL}/telegram-webhook`).catch(() => {});
  }

  bot.on('message', async msg => {
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();

    if (text.startsWith('/')) {
      await handleCommand(chatId, text);
    } else {
      await handleExpenseMessage(chatId, text);
    }
  });
}

async function handleCommand(chatId, text) {
  const cmd = text.split(' ')[0].toLowerCase();

  if (cmd === '/start' || cmd === '/help') {
    bot.sendMessage(
      chatId,
      `💰 *Expense Tracker Bot*\n\n` +
      `*Add expense:*\n\`item, category, amount\`\n` +
      `e.g. \`Lunch, Food, 12.50\`\n\n` +
      `*Commands:*\n` +
      `/summary — this month's totals\n` +
      `/last5 — last 5 entries\n` +
      `/delete last — delete most recent entry`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (cmd === '/summary') {
    try {
      const rows = await getAllRows();
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const totals = {};
      let grand = 0;
      for (const row of rows) {
        const [date, , cat, amt] = row;
        if (date && date.startsWith(ym)) {
          totals[cat] = (totals[cat] || 0) + parseFloat(amt || 0);
          grand += parseFloat(amt || 0);
        }
      }
      const lines = CATEGORIES.filter(c => totals[c])
        .map(c => `• ${c}: $${totals[c].toFixed(2)}`);
      if (!lines.length) {
        bot.sendMessage(chatId, 'No expenses recorded this month.');
        return;
      }
      bot.sendMessage(
        chatId,
        `📊 *${now.toLocaleString('en-US', { month: 'long', timeZone: 'Asia/Singapore' })} Summary*\n\n` +
        lines.join('\n') +
        `\n\n*Total: $${grand.toFixed(2)}*`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      bot.sendMessage(chatId, `Error: ${err.message}`);
    }
    return;
  }

  if (cmd === '/last5') {
    try {
      const rows = await getAllRows();
      const last = rows.slice(-5).reverse();
      if (!last.length) {
        bot.sendMessage(chatId, 'No expenses yet.');
        return;
      }
      const lines = last.map(
        ([date, item, cat, amt]) =>
          `• ${item} | ${cat} | $${parseFloat(amt).toFixed(2)} on ${formatDateForReply(date)}`
      );
      bot.sendMessage(chatId, `🕐 *Last 5 Entries*\n\n${lines.join('\n')}`, {
        parse_mode: 'Markdown',
      });
    } catch (err) {
      bot.sendMessage(chatId, `Error: ${err.message}`);
    }
    return;
  }

  if (text.toLowerCase() === '/delete last') {
    try {
      const rows = await getAllRows();
      if (!rows.length) {
        bot.sendMessage(chatId, 'No entries to delete.');
        return;
      }
      const last = rows[rows.length - 1];
      const rowIndex = rows.length - 1;

      const sheets = await getSheetsClient();
      const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
      const sheet = meta.data.sheets.find(s => s.properties.title === SHEET_NAME);
      const sheetId = sheet.properties.sheetId;
      const startIndex = rowIndex + 1;

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: { sheetId, dimension: 'ROWS', startIndex, endIndex: startIndex + 1 },
              },
            },
          ],
        },
      });

      const updatedRows = await getAllRows();
      broadcastSSE(updatedRows);

      bot.sendMessage(
        chatId,
        `🗑 Deleted: ${last[1]} | ${last[2]} | $${parseFloat(last[3]).toFixed(2)} on ${formatDateForReply(last[0])}`
      );
    } catch (err) {
      bot.sendMessage(chatId, `Error: ${err.message}`);
    }
    return;
  }

  bot.sendMessage(chatId, 'Unknown command. Send /help for usage.');
}

async function handleExpenseMessage(chatId, text) {
  const parts = text.split(',').map(s => s.trim());
  if (parts.length !== 3) {
    bot.sendMessage(
      chatId,
      '❌ Invalid format.\n\nUse: `item, category, amount`\ne.g. `Lunch, Food, 12.50`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const [item, rawCat, rawAmt] = parts;
  const category = CATEGORIES.find(c => c.toLowerCase() === rawCat.toLowerCase());
  if (!category) {
    bot.sendMessage(
      chatId,
      `❌ Invalid category: *${rawCat}*\n\nValid categories: ${CATEGORIES.join(', ')}`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const amount = parseFloat(rawAmt);
  if (isNaN(amount) || amount <= 0) {
    bot.sendMessage(chatId, '❌ Invalid amount. Use a positive number, e.g. `12.50`', {
      parse_mode: 'Markdown',
    });
    return;
  }

  const date = sgtToday();
  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:D`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[date, item, category, amount]] },
    });
    const rows = await getAllRows();
    broadcastSSE(rows);

    bot.sendMessage(
      chatId,
      `✅ Added: ${item} | ${category} | $${amount.toFixed(2)} on ${formatDateForReply(date)}`
    );
  } catch (err) {
    bot.sendMessage(chatId, `Error saving expense: ${err.message}`);
  }
}

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
