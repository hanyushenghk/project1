require('dotenv').config();
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

/** YouTube Data API v3 搜索（需环境变量 YOUTUBE_API_KEY） */
app.get('/api/youtube-search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) {
    return res.status(400).json({ videos: [], error: 'empty_query' });
  }
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ videos: [], error: 'missing_api_key' });
  }
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('q', q);
    url.searchParams.set('type', 'video');
    url.searchParams.set('maxResults', '15');
    url.searchParams.set('relevanceLanguage', 'zh');
    url.searchParams.set('regionCode', 'TW');
    url.searchParams.set('key', apiKey);
    const r = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
    const data = await r.json();
    if (!r.ok) {
      const msg = data.error && data.error.message ? data.error.message : r.statusText;
      return res.status(500).json({ videos: [], error: msg });
    }
    const videos = (data.items || [])
      .filter((item) => item.id && item.id.videoId)
      .map((item) => ({
        id: item.id.videoId,
        title: item.snippet.title || '无标题',
        artist: item.snippet.channelTitle || 'YouTube',
        tags: ['youtube-search'],
      }));
    res.json({ videos, source: 'youtube' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ videos: [], error: err.message || 'search_failed' });
  }
});

/** 最近一周热门音乐：近7天上传 + 音乐分区 + 按播放量降序（不区分语言） */
app.get('/api/youtube-week-popular', async (req, res) => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ videos: [], error: 'missing_api_key' });
  }
  const publishedAfter = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString();
  })();
  function mapSearchItems(items) {
    return (items || [])
      .filter((item) => item.id && item.id.videoId)
      .map((item) => ({
        id: item.id.videoId,
        title: item.snippet.title || '无标题',
        artist: item.snippet.channelTitle || 'YouTube',
        tags: ['youtube-week-popular'],
      }));
  }
  try {
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('videoCategoryId', '10');
    searchUrl.searchParams.set('publishedAfter', publishedAfter);
    searchUrl.searchParams.set('order', 'viewCount');
    searchUrl.searchParams.set('maxResults', '15');
    // `q` 必填更稳定；使用中性关键词，不区分中文/英文
    searchUrl.searchParams.set('q', 'music');
    searchUrl.searchParams.set('key', apiKey);
    const r1 = await fetch(searchUrl.toString(), { signal: AbortSignal.timeout(12000) });
    const d1 = await r1.json();
    if (!r1.ok) {
      const msg = d1.error && d1.error.message ? d1.error.message : r1.statusText;
      return res.status(500).json({ videos: [], error: msg });
    }
    const videos = mapSearchItems(d1.items);
    const source = 'youtube-week-viewcount';
    res.json({ videos, source });
  } catch (err) {
    console.error(err);
    res.status(500).json({ videos: [], error: err.message || 'fetch_failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`News server running at http://localhost:${PORT}`);
});
