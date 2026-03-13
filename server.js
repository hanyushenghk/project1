const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const path = require('path');

const app = express();
const parser = new Parser();

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// 中文新闻 RSS 源
const FEEDS = [
  'https://www.chinanews.com.cn/rss/scroll-news.xml',  // 中新网-即时
  'https://www.chinanews.com.cn/rss/china.xml',        // 中新网-时政
  'https://www.chinanews.com.cn/rss/world.xml',        // 中新网-国际
  'https://www.chinanews.com.cn/rss/society.xml',      // 中新网-社会
  'https://www.chinanews.com.cn/rss/finance.xml',      // 中新网-财经
  'http://rss.sina.com.cn/news/marquee/ddt.xml',       // 新浪-要闻
  'http://rss.sina.com.cn/news/china/focus15.xml',     // 新浪-国内
  'http://rss.sina.com.cn/news/world/focus15.xml',     // 新浪-国际
];

const FEED_TIMEOUT_MS = 8000;

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
    // Sort by date descending (newest first)
    items.sort((a, b) => (new Date(b.pubDate) - new Date(a.pubDate)));
    // Return up to 50 for client-side archive (keep ~1 week)
    const latest = items.slice(0, 50);
    res.json({ articles: latest });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch news', articles: [] });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`News server running at http://localhost:${PORT}`);
});
