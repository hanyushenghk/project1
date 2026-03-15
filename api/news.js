const Parser = require('rss-parser');
const parser = new Parser();

// 纽约时报 RSS 源（英文）
// 官方 RSS 列表参考：https://www.nytimes.com/rss
const FEEDS = [
  'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml',
];

const FEED_TIMEOUT_MS = 8000;
const TRANSLATE_CONCURRENCY = 5;
const TRANSLATE_DELAY_MS = 150;

async function translateToChinese(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) return text;
  const trimmed = text.trim().slice(0, 500);
  try {
    const res = await fetch(
      'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(trimmed) + '&langpair=en|zh',
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    const translated = data.responseData?.translatedText;
    return translated && translated.trim() ? translated.trim() : text;
  } catch (_) {
    return text;
  }
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  try {
    const items = await fetchAllItems();
    items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    const latest = items.slice(0, 50);
    const translated = await translateBatch(latest);
    res.status(200).json({ articles: translated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch news', articles: [] });
  }
};
