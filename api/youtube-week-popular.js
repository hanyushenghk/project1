/**
 * 近一周热门流行（音乐类）：YouTube Data API v3
 * - 优先：search（音乐分区 + 近 7 天上传 + 按播放量排序）
 * - 不足时用：videos chart=mostPopular 音乐分区（全区当前热门，作补充）
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

function mapChartItems(items) {
  return (items || [])
    .filter((item) => item.id)
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : item.id.videoId,
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
  url.searchParams.set('q', '流行 音乐 MV');
  url.searchParams.set('relevanceLanguage', 'zh');
  url.searchParams.set('regionCode', 'TW');
  url.searchParams.set('key', apiKey);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.error && data.error.message ? data.error.message : res.statusText;
    throw new Error(msg);
  }
  return mapSearchItems(data.items);
}

async function fetchMusicChart(apiKey) {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('chart', 'mostPopular');
  url.searchParams.set('videoCategoryId', '10');
  url.searchParams.set('regionCode', 'TW');
  url.searchParams.set('maxResults', '15');
  url.searchParams.set('key', apiKey);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.error && data.error.message ? data.error.message : res.statusText;
    throw new Error(msg);
  }
  return mapChartItems(data.items);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ videos: [], error: 'missing_api_key' });
  }

  try {
    let videos = await fetchWeekMusicByViews(apiKey);
    let source = 'youtube-week-search';

    if (videos.length < 8) {
      const chart = await fetchMusicChart(apiKey);
      const seen = new Set(videos.map((v) => v.id));
      for (const v of chart) {
        if (videos.length >= 15) break;
        if (!seen.has(v.id)) {
          seen.add(v.id);
          videos.push(v);
        }
      }
      source = videos.length ? 'youtube-week-mixed' : 'youtube-chart';
    }

    if (videos.length === 0) {
      videos = await fetchMusicChart(apiKey);
      source = 'youtube-chart-only';
    }

    return res.status(200).json({ videos, source });
  } catch (err) {
    console.error('youtube-week-popular:', err);
    return res.status(500).json({ videos: [], error: err.message || 'fetch_failed' });
  }
};
