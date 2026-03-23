(function () {
  const STORAGE_KEY = 'music-listener-prefs-v1';
  const MIN_TOTAL_SEC_FOR_PREF = 20;

  const catalog = Array.isArray(window.MUSIC_CATALOG) ? window.MUSIC_CATALOG : [];
  const $grid = document.getElementById('music-grid');
  const $hint = document.getElementById('music-hint');
  const $sectionTitle = document.getElementById('music-section-title');
  const $searchInput = document.getElementById('music-search-input');
  const $searchBtn = document.getElementById('music-search-btn');
  const $backRecommend = document.getElementById('music-back-recommend');
  const $btnReset = document.getElementById('btn-reset-music-prefs');

  /** @type {Map<string, {id:string,title:string,artist:string,tags:string[]}>} */
  const byId = new Map(catalog.map((s) => [s.id, s]));

  let prefs = loadPrefs();
  const playingIds = new Set();
  let tickTimer = null;
  /** @type {YT.Player[]} */
  const players = [];
  let apiInited = false;

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { perVideo: {}, tagScores: {} };
      const o = JSON.parse(raw);
      return {
        perVideo: o.perVideo && typeof o.perVideo === 'object' ? o.perVideo : {},
        tagScores: o.tagScores && typeof o.tagScores === 'object' ? o.tagScores : {},
      };
    } catch {
      return { perVideo: {}, tagScores: {} };
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (_) {}
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function totalListenSeconds() {
    return Object.values(prefs.perVideo).reduce((s, n) => s + (Number(n) || 0), 0);
  }

  function pickTenSongs() {
    if (catalog.length === 0) return [];
    const total = totalListenSeconds();
    if (total < MIN_TOTAL_SEC_FOR_PREF) {
      return shuffle(catalog).slice(0, Math.min(10, catalog.length));
    }
    const tagScores = prefs.tagScores || {};
    function scoreSong(s) {
      return (s.tags || []).reduce((acc, t) => acc + (Number(tagScores[t]) || 0), 0);
    }
    const ranked = catalog.map((s) => ({ s, sc: scoreSong(s) })).sort((a, b) => b.sc - a.sc);
    const out = [];
    const seen = new Set();
    for (const { s } of ranked) {
      if (out.length >= 10) break;
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
    if (out.length < 10) {
      for (const s of shuffle(catalog)) {
        if (out.length >= 10) break;
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        out.push(s);
      }
    }
    return out.slice(0, Math.min(10, catalog.length));
  }

  function bumpVideoSeconds(videoId) {
    prefs.perVideo[videoId] = (Number(prefs.perVideo[videoId]) || 0) + 1;
    const song = byId.get(videoId);
    if (song) {
      for (const t of song.tags || []) {
        prefs.tagScores[t] = (Number(prefs.tagScores[t]) || 0) + 1;
      }
    } else {
      prefs.tagScores['youtube-search'] = (Number(prefs.tagScores['youtube-search']) || 0) + 1;
    }
  }

  function startTick() {
    if (tickTimer) return;
    tickTimer = setInterval(() => {
      if (playingIds.size === 0) return;
      playingIds.forEach((id) => bumpVideoSeconds(id));
      savePrefs();
    }, 1000);
  }

  function stopTickIfIdle() {
    if (playingIds.size === 0 && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function destroyPlayers() {
    players.forEach((p) => {
      try {
        if (p && typeof p.destroy === 'function') p.destroy();
      } catch (_) {}
    });
    players.length = 0;
    playingIds.clear();
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function songMatchesQuery(song, raw) {
    const q = (raw || '').trim();
    if (!q) return false;
    const t = song.title || '';
    const a = song.artist || '';
    const ql = q.toLowerCase();
    return t.includes(q) || a.includes(q) || t.toLowerCase().includes(ql) || a.toLowerCase().includes(ql);
  }

  function searchCatalog(raw) {
    const q = (raw || '').trim();
    if (!q) return [];
    return catalog.filter((s) => songMatchesQuery(s, q));
  }

  function setSectionTitle(text) {
    if ($sectionTitle) $sectionTitle.textContent = text;
  }

  function renderGrid(songs) {
    if (!$grid) return;
    $grid.innerHTML = '';
    songs.forEach((song, i) => {
      const card = document.createElement('article');
      card.className = 'music-card';
      card.dataset.videoId = song.id;
      const h2 = document.createElement('h2');
      h2.innerHTML = `${escapeHtml(song.title)} <span class="artist">— ${escapeHtml(song.artist)}</span>`;
      const wrap = document.createElement('div');
      wrap.className = 'player-wrap';
      const holder = document.createElement('div');
      holder.id = `yt-player-${i}`;
      wrap.appendChild(holder);
      card.appendChild(h2);
      card.appendChild(wrap);
      $grid.appendChild(card);
    });
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function updateHintRecommend(usedPref) {
    if (!$hint) return;
    const total = totalListenSeconds();
    if (usedPref) {
      $hint.textContent = `已根据你累计收听约 ${Math.round(total)} 秒的偏好，为你推荐这 10 首歌（刷新后仍会更新）。`;
    } else {
      $hint.textContent =
        total > 0 && total < MIN_TOTAL_SEC_FOR_PREF
          ? `再听一会儿（累计满约 ${MIN_TOTAL_SEC_FOR_PREF} 秒后刷新），系统会根据喜好自动换一批更合口味的歌。`
          : '首次访问：随机 10 首中文流行。播放越久，下次刷新越懂你的口味。';
    }
  }

  function onPlayerStateChange(event) {
    const id = event.target.getVideoData().video_id;
    if (event.data === YT.PlayerState.PLAYING) {
      playingIds.add(id);
      startTick();
    } else {
      playingIds.delete(id);
      savePrefs();
      stopTickIfIdle();
    }
  }

  function createPlayers(songs, opts) {
    const autoplayFirst = opts && opts.autoplayFirst === true;
    songs.forEach((song, i) => {
      const p = new YT.Player(`yt-player-${i}`, {
        videoId: song.id,
        width: 320,
        height: 180,
        playerVars: {
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          autoplay: autoplayFirst && i === 0 ? 1 : 0,
          mute: autoplayFirst && i === 0 ? 1 : 0,
        },
        events: { onStateChange: onPlayerStateChange },
      });
      players.push(p);
    });
  }

  function showRecommend() {
    if (!$grid) return;
    destroyPlayers();
    if (!catalog.length) {
      $grid.innerHTML =
        '<p class="search-empty" role="status">曲库未加载。请确认已引入 music-catalog.js，或使用上方搜索在 YouTube 上查找。</p>';
      if ($hint) $hint.textContent = '曲库为空，请使用搜索框在 YouTube 上搜索歌曲。';
      setSectionTitle('为你推荐');
      return;
    }
    const total = totalListenSeconds();
    const usedPref = total >= MIN_TOTAL_SEC_FOR_PREF;
    const songs = pickTenSongs();
    renderGrid(songs);
    updateHintRecommend(usedPref);
    setSectionTitle(`为你推荐（${songs.length} 首）`);
    createPlayers(songs, { autoplayFirst: true });
  }

  async function showSearchResults() {
    if (!$grid) return;
    const raw = $searchInput ? $searchInput.value : '';
    const q = raw.trim();
    if (!q) {
      showRecommend();
      return;
    }

    if ($searchBtn) $searchBtn.disabled = true;
    setSectionTitle('正在搜索 YouTube…');
    if ($hint) $hint.textContent = '正在从 YouTube 获取结果…';

    let ytVideos = null;
    let ytError = null;
    try {
      const r = await fetch('/api/youtube-search?' + new URLSearchParams({ q }));
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.videos && data.videos.length > 0) {
        ytVideos = data.videos;
      } else {
        ytError = data.error || (r.status === 503 ? 'missing_api_key' : 'no_results');
      }
    } catch (_) {
      ytError = 'network';
    } finally {
      if ($searchBtn) $searchBtn.disabled = false;
    }

    destroyPlayers();

    if (ytVideos && ytVideos.length) {
      setSectionTitle(`YouTube 搜索结果（${ytVideos.length} 个）`);
      if ($hint) $hint.textContent = `已显示与「${q}」相关的 YouTube 视频（最多 15 个）。`;
      renderGrid(ytVideos);
      createPlayers(ytVideos, { autoplayFirst: false });
      return;
    }

    const local = searchCatalog(q);
    setSectionTitle(`站内曲库（${local.length} 首）`);
    if (ytError === 'missing_api_key') {
      if ($hint) {
        $hint.textContent = `未配置 YouTube API（YOUTUBE_API_KEY），已在站内曲库搜索「${q}」。本地可在终端执行：export YOUTUBE_API_KEY=你的密钥 后再 npm start。`;
      }
    } else if (ytError === 'network') {
      if ($hint) $hint.textContent = `无法访问 YouTube 搜索接口，已在站内曲库搜索「${q}」。`;
    } else if (local.length) {
      if ($hint) $hint.textContent = `YouTube 暂无可用结果，已显示站内曲库 ${local.length} 首与「${q}」相关的歌曲。`;
    } else {
      if ($hint) $hint.textContent = `未找到与「${q}」相关的 YouTube 视频或站内歌曲。`;
    }

    if (!local.length) {
      $grid.innerHTML =
        '<p class="search-empty" role="status">未找到匹配结果。可换个关键词试试，或点击「返回推荐」。</p>';
      return;
    }
    renderGrid(local);
    createPlayers(local, { autoplayFirst: false });
  }

  function init() {
    if (apiInited) return;
    apiInited = true;
    showRecommend();

    if ($searchBtn) {
      $searchBtn.addEventListener('click', () => {
        showSearchResults();
      });
    }
    if ($searchInput) {
      $searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          showSearchResults();
        }
      });
    }
    if ($backRecommend) {
      $backRecommend.addEventListener('click', () => {
        if ($searchInput) $searchInput.value = '';
        showRecommend();
      });
    }
  }

  if ($btnReset) {
    $btnReset.addEventListener('click', () => {
      if (confirm('确定清除本机记录的听歌时长与偏好？')) {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch (_) {}
        location.reload();
      }
    });
  }

  window.addEventListener('beforeunload', () => savePrefs());

  function boot() {
    window.onYouTubeIframeAPIReady = init;
    if (window.YT && window.YT.Player) {
      init();
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const first = document.getElementsByTagName('script')[0];
    first.parentNode.insertBefore(tag, first);
  }

  boot();
})();
