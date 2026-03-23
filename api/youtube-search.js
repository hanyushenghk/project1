/**
 * YouTube Data API v3 搜索代理（密钥放在 Vercel 环境变量 YOUTUBE_API_KEY）
 * GET /api/youtube-search?q=关键词
 */
async function searchYouTube(q, apiKey) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', q);
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '15');
  url.searchParams.set('relevanceLanguage', 'zh');
  url.searchParams.set('regionCode', 'TW');
  url.searchParams.set('key', apiKey);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.error && data.error.message ? data.error.message : res.statusText;
    throw new Error(msg);
  }
  const videos = (data.items || [])
    .filter((item) => item.id && item.id.videoId)
    .map((item) => ({
      id: item.id.videoId,
      title: item.snippet.title || '无标题',
      artist: item.snippet.channelTitle || 'YouTube',
      tags: ['youtube-search'],
    }));
  return videos;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) {
    return res.status(400).json({ videos: [], error: 'empty_query' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ videos: [], error: 'missing_api_key' });
  }

  try {
    const videos = await searchYouTube(q, apiKey);
    return res.status(200).json({ videos, source: 'youtube' });
  } catch (err) {
    console.error('youtube-search:', err);
    return res.status(500).json({ videos: [], error: err.message || 'search_failed' });
  }
};
