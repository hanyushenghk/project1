/**
 * 最近一周热门音乐：YouTube Data API v3
 * 规则：近 7 天上传 + 音乐分区 + 按播放量降序
 * 不区分中文/英文，不做地区限制
 * GET /api/youtube-week-popular
 */
function publishedAfter7DaysAgo() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString();
}

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

async function fetchWeekMusicByViews(apiKey) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('videoCategoryId', '10');
  url.searchParams.set('publishedAfter', publishedAfter7DaysAgo());
  url.searchParams.set('order', 'viewCount');
  url.searchParams.set('maxResults', '15');
  url.searchParams.set('key', apiKey);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.error && data.error.message ? data.error.message : res.statusText;
    throw new Error(msg);
  }
  return mapSearchItems(data.items);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ videos: [], error: 'missing_api_key' });
  }

  try {
    const videos = await fetchWeekMusicByViews(apiKey);
    const source = 'youtube-week-viewcount';
    return res.status(200).json({ videos, source });
  } catch (err) {
    console.error('youtube-week-popular:', err);
    return res.status(500).json({ videos: [], error: err.message || 'fetch_failed' });
  }
};
