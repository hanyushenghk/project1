const Parser = require('rss-parser');
const parser = new Parser();

const FEEDS = [
  'https://www.chinanews.com.cn/rss/scroll-news.xml',
  'https://www.chinanews.com.cn/rss/china.xml',
  'https://www.chinanews.com.cn/rss/world.xml',
  'https://www.chinanews.com.cn/rss/society.xml',
  'https://www.chinanews.com.cn/rss/finance.xml',
  'http://rss.sina.com.cn/news/marquee/ddt.xml',
  'http://rss.sina.com.cn/news/china/focus15.xml',
  'http://rss.sina.com.cn/news/world/focus15.xml',
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  try {
    const items = await fetchAllItems();
    items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    const latest10 = items.slice(0, 10);
    res.status(200).json({ articles: latest10 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch news', articles: [] });
  }
};
