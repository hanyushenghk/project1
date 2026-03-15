const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const path = require('path');

const app = express();
const parser = new Parser();

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// 纽约时报 RSS 源（英文）
// 官方 RSS 列表参考：https://www.nytimes.com/rss
const FEEDS = [
  'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', // 首页头条
  'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',    // 世界
  'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', // 商业
  'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', // 科技
  'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml',  // 科学
];

const FEED_TIMEOUT_MS = 8000;
const TRANSLATE_CONCURRENCY = 5;
const TRANSLATE_DELAY_MS = 150;

async function translateToChinese(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) return text;
  const trimmed = text.trim().slice(0, 500);
  const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(trimmed) + '&langpair=en|zh';
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return text;
    const data = await res.json();
    const translated = data.responseData && data.responseData.translatedText;
    if (translated && typeof translated === 'string') {
      const t = translated.trim();
      if (t && t !== trimmed) return t;
    }
  } catch (_) {}
  return text;
}

async function translateBatch(items) {
  const out = [];
  for (let i = 0; i < items.length; i += TRANSLATE_CONCURRENCY) {
    const batch = items.slice(i, i + TRANSLATE_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (item) => ({
        ...item,
        title: await translateToChinese(item.title),
      }))
    );
    results.forEach((r, j) => {
      if (r.status === 'fulfilled') out.push(r.value);
      else out.push(batch[j]);
    });
    if (i + TRANSLATE_CONCURRENCY < items.length) {
      await new Promise((r) => setTimeout(r, TRANSLATE_DELAY_MS));
    }
  }
  return out;
}

function parseOneFeed(url) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve([]), FEED_TIMEOUT_MS);
    parser
      .parseURL(url)
      .then((feed) => {
        clearTimeout(timer);
        const items = (feed.items || []).map((item) => ({
          title: item.title || '无标题',
          link: item.link || '#',
          pubDate: item.pubDate ? new Date(item.pubDate).toISOString() : null,
          source: feed.title || '资讯',
          content: item.contentSnippet || item.content || '',
        }));
        resolve(items);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve([]);
      });
  });
}

async function fetchAllItems() {
  const results = await Promise.allSettled(FEEDS.map(parseOneFeed));
  const all = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) all.push(...r.value);
  }
  return all;
}

app.get('/api/news', async (req, res) => {
  try {
    const items = await fetchAllItems();
    items.sort((a, b) => (new Date(b.pubDate) - new Date(a.pubDate)));
    const latest = items.slice(0, 50);
    const translated = await translateBatch(latest);
    res.json({ articles: translated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch news', articles: [] });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`News server running at http://localhost:${PORT}`);
});
