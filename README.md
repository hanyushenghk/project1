# Latest News Website

A small website that fetches the **10 latest news** articles from live RSS feeds and **selects the single latest** one, showing it in a highlighted “Latest” section at the top.

## Run it

```bash
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

### Connection failed (Error -102)?

That usually means the server isn’t running. Do this **before** opening the URL:

1. **Install Node.js** if needed: [nodejs.org](https://nodejs.org) (LTS).
2. Open a terminal (Terminal.app, iTerm, or VS Code integrated terminal).
3. Go to the project folder:
   ```bash
   cd /Users/hanyusheng99/Documents/ai_study/project1
   ```
4. Install and start:
   ```bash
   npm install
   npm start
   ```
5. When you see `News server running at http://localhost:3000`, open that URL in your browser.

Leave the terminal open while you use the site; closing it stops the server.

## What it does

- **Backend** (`server.js`): Fetches headlines from BBC, NYT, and NPR RSS feeds, merges and sorts by date, and returns the 10 most recent via `/api/news`.
- **Frontend**: Requests `/api/news`, shows all 10 in a list and **features the very latest** in a “Latest” box at the top with a gold-style highlight.

The “latest” is simply the first of the 10 (newest by publication date).
