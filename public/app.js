const API = '/api/news';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 每 5 分钟更新一次

const $featured = document.getElementById('latest-featured');
const $list = document.getElementById('news-list');
const $updateStatus = document.getElementById('update-status');

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderFeatured(article) {
  if (!article) {
    $featured.classList.add('empty');
    $featured.innerHTML = '';
    return;
  }
  $featured.classList.remove('empty');
  $featured.innerHTML = `
    <span class="badge">最新</span>
    <h2 class="title"><a href="${escapeHtml(article.link)}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a></h2>
    <p class="meta">${escapeHtml(article.source)} · ${formatDate(article.pubDate)}</p>
    ${article.content ? `<p class="summary">${escapeHtml(article.content.slice(0, 200))}${article.content.length > 200 ? '…' : ''}</p>` : ''}
  `;
}

function renderList(articles) {
  if (!articles || !articles.length) {
    $list.innerHTML = '<li class="loading">暂无文章。</li>';
    return;
  }
  $list.innerHTML = articles
    .map(
      (a, i) => `
    <li>
      <h3 class="item-title"><a href="${escapeHtml(a.link)}" target="_blank" rel="noopener">${escapeHtml(a.title)}</a></h3>
      <p class="item-meta">#${i + 1} · ${escapeHtml(a.source)} · ${formatDate(a.pubDate)}</p>
    </li>
  `
    )
    .join('');
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function setLoading(loading) {
  if (loading) {
    $featured.classList.add('empty');
    $featured.innerHTML = '';
    $list.innerHTML = '<li class="loading">正在加载最新资讯…</li>';
  }
}

function setError(message) {
  $featured.classList.add('empty');
  $featured.innerHTML = '';
  $list.innerHTML = `<li class="error">${escapeHtml(message)}</li>`;
}

function setUpdateStatus(text) {
  if ($updateStatus) $updateStatus.textContent = text;
}

async function load() {
  setLoading(true);
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error('Failed to load news');
    const data = await res.json();
    const articles = data.articles || [];
    const latest = articles[0] || null;
    renderFeatured(latest);
    renderList(articles);
    setUpdateStatus('上次更新：' + new Date().toLocaleString('zh-CN'));
  } catch (err) {
    setError(err.message || '无法加载资讯，请确认服务器已启动。');
    setUpdateStatus('');
  }
}

load();
setInterval(load, REFRESH_INTERVAL_MS);
