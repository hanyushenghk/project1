const API = '/api/news';
const REFRESH_INTERVAL_MS = 2 * 60 * 1000; // 每 2 分钟自动更新
const STORAGE_KEY = 'project1-news-data';
const ARCHIVE_KEY = 'project1-news-archive';
const PAGE_SIZE = 15;
const ARCHIVE_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const $featured = document.getElementById('latest-featured');
const $list = document.getElementById('news-list');
const $pagination = document.getElementById('pagination');
const $updateStatus = document.getElementById('update-status');
let refreshCountdownTimer = null;
let allArticles = [];
let currentPage = 1;

function getArchive() {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data.articles) ? data.articles : [];
  } catch {
    return [];
  }
}

function saveArchive(articles) {
  try {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify({ articles }));
  } catch (_) {}
}

function mergeAndPruneArchive(newArticles) {
  const byLink = new Map();
  const now = Date.now();
  // 先用本次接口返回的数据（含翻译）覆盖，确保显示最新翻译结果
  for (const a of newArticles || []) {
    if (a.link) byLink.set(a.link, { ...a, fetchedAt: a.fetchedAt || new Date().toISOString() });
  }
  // 再补入存档里本周内、且本次未返回的旧条
  for (const a of getArchive()) {
    if (a.link && a.pubDate && !byLink.has(a.link)) {
      const t = new Date(a.pubDate).getTime();
      if (now - t <= ARCHIVE_DAYS_MS) byLink.set(a.link, a);
    }
  }
  const merged = Array.from(byLink.values()).filter((a) => {
    const t = new Date(a.pubDate).getTime();
    return now - t <= ARCHIVE_DAYS_MS;
  });
  merged.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  saveArchive(merged);
  return merged;
}

function getStoredData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { likes: {}, comments: {} };
    const data = JSON.parse(raw);
    return {
      likes: data.likes || {},
      comments: data.comments || {},
    };
  } catch {
    return { likes: {}, comments: {} };
  }
}

function setStoredData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (_) {}
}

function getLikeCount(link) {
  return getStoredData().likes[link] || 0;
}

function setLikeCount(link, count) {
  const data = getStoredData();
  data.likes[link] = Math.max(0, count);
  setStoredData(data);
}

function toggleLike(link) {
  const data = getStoredData();
  const cur = data.likes[link] || 0;
  data.likes[link] = cur + 1;
  setStoredData(data);
}

function getComments(link) {
  return getStoredData().comments[link] || [];
}

function addComment(link, text) {
  const data = getStoredData();
  if (!data.comments[link]) data.comments[link] = [];
  data.comments[link].push(text.trim());
  setStoredData(data);
}

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

function renderArticleActions(link, options) {
  const { showCommentBox = false } = options || {};
  const likeCount = getLikeCount(link);
  const comments = getComments(link);
  const commentCount = comments.length;
  return `
    <div class="article-actions" data-article-link="${escapeHtml(link)}">
      <button type="button" class="btn-action btn-comment" aria-label="评论">💬 评论 ${commentCount > 0 ? commentCount : ''}</button>
      <button type="button" class="btn-action btn-like" aria-label="点赞">❤️ 点赞 ${likeCount > 0 ? likeCount : ''}</button>
      <button type="button" class="btn-action btn-share" aria-label="转发">🔗 转发</button>
      <div class="comment-box" style="display:${showCommentBox ? 'block' : 'none'}">
        <ul class="comment-list">${comments.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
        <div class="comment-form">
          <input type="text" class="comment-input" placeholder="写一条评论…" maxlength="500" />
          <button type="button" class="btn-submit-comment">发送</button>
        </div>
      </div>
    </div>
  `;
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
    ${renderArticleActions(article.link)}
  `;
}

function renderListPage(articles, page) {
  if (!articles || !articles.length) {
    $list.innerHTML = '<li class="loading">暂无文章。</li>';
    if ($pagination) $pagination.innerHTML = '';
    return;
  }
  const totalPages = Math.max(1, Math.ceil(articles.length / PAGE_SIZE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * PAGE_SIZE;
  const pageArticles = articles.slice(start, start + PAGE_SIZE);

  $list.innerHTML = pageArticles
    .map(
      (a, i) => `
    <li data-article-link="${escapeHtml(a.link)}">
      <h3 class="item-title"><a href="${escapeHtml(a.link)}" target="_blank" rel="noopener">${escapeHtml(a.title)}</a></h3>
      <p class="item-meta">#${start + i + 1} · ${escapeHtml(a.source)} · ${formatDate(a.pubDate)}</p>
      ${renderArticleActions(a.link)}
    </li>
  `
    )
    .join('');

  if ($pagination) {
    const prevDisabled = safePage <= 1;
    const nextDisabled = safePage >= totalPages;
    let pageNumbers = '';
    const showPages = 5;
    let from = Math.max(1, safePage - Math.floor(showPages / 2));
    let to = Math.min(totalPages, from + showPages - 1);
    if (to - from + 1 < showPages) from = Math.max(1, to - showPages + 1);
    for (let p = from; p <= to; p++) {
      pageNumbers += `<button type="button" class="pagination-num ${p === safePage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }
    $pagination.innerHTML = `
      <div class="pagination-info">共 ${articles.length} 条 · 第 ${safePage} / ${totalPages} 页</div>
      <div class="pagination-btns">
        <button type="button" class="pagination-prev" ${prevDisabled ? 'disabled' : ''} data-page="${safePage - 1}">上一页</button>
        ${pageNumbers}
        <button type="button" class="pagination-next" ${nextDisabled ? 'disabled' : ''} data-page="${safePage + 1}">下一页</button>
      </div>
    `;
    $pagination.querySelectorAll('.pagination-num, .pagination-prev, .pagination-next').forEach((btn) => {
      if (btn.disabled) return;
      btn.addEventListener('click', () => {
        const p = parseInt(btn.getAttribute('data-page'), 10);
        if (p >= 1 && p <= totalPages) {
          currentPage = p;
          renderListPage(allArticles, currentPage);
          bindArticleActions();
          $pagination.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });
  }
  currentPage = safePage;
}


function bindArticleActions() {
  document.querySelectorAll('.article-actions').forEach((el) => {
    const link = el.getAttribute('data-article-link');
    if (!link) return;
    const commentBtn = el.querySelector('.btn-comment');
    const likeBtn = el.querySelector('.btn-like');
    const shareBtn = el.querySelector('.btn-share');
    const commentBox = el.querySelector('.comment-box');
    const commentInput = el.querySelector('.comment-input');
    const submitBtn = el.querySelector('.btn-submit-comment');

    if (commentBtn && commentBox) {
      commentBtn.addEventListener('click', () => {
        const isOpen = commentBox.style.display === 'block';
        commentBox.style.display = isOpen ? 'none' : 'block';
        if (!isOpen && commentInput) commentInput.focus();
      });
    }
    if (likeBtn) {
      likeBtn.addEventListener('click', () => {
        const data = getStoredData();
        const cur = data.likes[link] || 0;
        data.likes[link] = cur + 1;
        setStoredData(data);
        likeBtn.innerHTML = `❤️ 点赞 ${cur + 1}`;
      });
    }
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        const title = el.closest('li, .latest-featured')?.querySelector('.item-title a, .title a')?.textContent?.trim() || '新闻';
        if (navigator.share) {
          navigator.share({ title, url: link }).catch(() => copyLink(link));
        } else {
          copyLink(link);
        }
      });
    }
    function copyLink(url) {
      navigator.clipboard.writeText(url).then(() => {
        shareBtn.textContent = '🔗 已复制链接';
        setTimeout(() => { shareBtn.innerHTML = '🔗 转发'; }, 1500);
      }).catch(() => { shareBtn.textContent = '🔗 转发'; });
    }
    if (submitBtn && commentInput) {
      const doSubmit = () => {
        const text = commentInput.value.trim();
        if (!text) return;
        addComment(link, text);
        commentInput.value = '';
        const ul = commentBox.querySelector('.comment-list');
        if (ul) {
          const li = document.createElement('li');
          li.textContent = text;
          ul.appendChild(li);
        }
        if (commentBtn) commentBtn.innerHTML = `💬 评论 ${getComments(link).length}`;
      };
      submitBtn.addEventListener('click', doSubmit);
      commentInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSubmit(); });
    }
  });
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
    if ($pagination) $pagination.innerHTML = '';
  }
}

function setError(message) {
  $featured.classList.add('empty');
  $featured.innerHTML = '';
  $list.innerHTML = `<li class="error">${escapeHtml(message)}</li>`;
  if ($pagination) $pagination.innerHTML = '';
}

function setUpdateStatus(text) {
  if ($updateStatus) $updateStatus.textContent = text;
}

function startRefreshCountdown() {
  if (refreshCountdownTimer) clearInterval(refreshCountdownTimer);
  let left = Math.ceil(REFRESH_INTERVAL_MS / 1000);
  function tick() {
    if (left <= 0) {
      if (refreshCountdownTimer) clearInterval(refreshCountdownTimer);
      refreshCountdownTimer = null;
      return;
    }
    const min = Math.floor(left / 60);
    const sec = left % 60;
    if ($updateStatus) {
      const status = $updateStatus.getAttribute('data-last-update') || '';
      $updateStatus.textContent = status + (status ? ' · ' : '') + (min > 0 ? min + ' 分 ' : '') + sec + ' 秒后自动刷新';
    }
    left--;
  }
  tick();
  refreshCountdownTimer = setInterval(tick, 1000);
}

async function load() {
  setLoading(true);
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error('Failed to load news');
    const data = await res.json();
    const fresh = data.articles || [];
    allArticles = mergeAndPruneArchive(fresh);
    const totalPages = Math.max(1, Math.ceil(allArticles.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = 1;
    const latest = allArticles[0] || null;
    renderFeatured(latest);
    renderListPage(allArticles, currentPage);
    bindArticleActions();
    const lastUpdate = '上次更新：' + new Date().toLocaleString('zh-CN');
    setUpdateStatus(lastUpdate);
    if ($updateStatus) $updateStatus.setAttribute('data-last-update', lastUpdate);
    startRefreshCountdown();
  } catch (err) {
    allArticles = getArchive();
    if (allArticles.length) {
      if (currentPage > Math.ceil(allArticles.length / PAGE_SIZE)) currentPage = 1;
      renderFeatured(allArticles[0]);
      renderListPage(allArticles, currentPage);
      bindArticleActions();
      setUpdateStatus('使用本地缓存 · ' + new Date().toLocaleString('zh-CN'));
    } else {
      setError(err.message || '无法加载资讯。请先运行 npm start，再在浏览器打开 http://localhost:3000');
      setUpdateStatus('');
    }
  }
}

load();
setInterval(load, REFRESH_INTERVAL_MS);

const $btnClearCache = document.getElementById('btn-clear-cache');
if ($btnClearCache) {
  $btnClearCache.addEventListener('click', () => {
    try {
      localStorage.removeItem(ARCHIVE_KEY);
      currentPage = 1;
      load();
    } catch (_) {}
  });
}
