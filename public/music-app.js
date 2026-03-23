(function () {
  const STORAGE_KEY = 'music-listener-prefs-v1';
  const MIN_TOTAL_SEC_FOR_PREF = 20;

  const catalog = Array.isArray(window.MUSIC_CATALOG) ? window.MUSIC_CATALOG : [];
  const $grid = document.getElementById('music-grid');
  const $hint = document.getElementById('music-hint');
  const $sectionTitle = document.getElementById('music-section-title');
  const $searchInput = document.getElementById('music-search-input');
  const $searchBtn = document.getElementById('music-search-btn');
  const $weekPopularBtn = document.getElementById('music-week-popular-btn');
  const $refreshBatchBtn = document.getElementById('music-refresh-batch');
  const $backRecommend = document.getElementById('music-back-recommend');
  const $btnReset = document.getElementById('btn-reset-music-prefs');

  /** 非曲库视频播放计分用（搜索 / 一周热门） */
  let externalPlayTag = 'youtube-search';

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

  /** 换一批：在偏好高分池内随机抽样，仍偏向你喜欢的风格 */
  function pickTenSongsVariety() {
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
    const poolSize = Math.min(28, Math.max(14, catalog.length));
    const pool = ranked.slice(0, poolSize).map((x) => x.s);
    const shuffled = shuffle(pool);
    const out = [];
    const seen = new Set();
    for (const s of shuffled) {
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
      prefs.tagScores[externalPlayTag] = (Number(prefs.tagScores[externalPlayTag]) || 0) + 1;
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

  function pauseOtherPlayers(currentPlayer) {
    players.forEach((p) => {
      if (p === currentPlayer) return;
      try {
        if (p && typeof p.pauseVideo === 'function') p.pauseVideo();
      } catch (_) {}
    });
  }

  function onPlayerStateChange(event) {
    const id = event.target.getVideoData().video_id;
    if (event.data === YT.PlayerState.PLAYING) {
      pauseOtherPlayers(event.target);
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

  function showRecommend(opts) {
    if (!$grid) return;
    const variety = opts && opts.variety === true;
    externalPlayTag = 'youtube-search';
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
    const songs = variety ? pickTenSongsVariety() : pickTenSongs();
    renderGrid(songs);
    if (variety) {
      if ($hint) {
        $hint.textContent = usedPref
          ? '已根据你的收听偏好换了一批推荐（仍优先匹配常听风格）。'
          : '已随机换了一批推荐。多听一会儿后，换一批会更贴合你的口味。';
      }
    } else {
      updateHintRecommend(usedPref);
    }
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

    externalPlayTag = 'youtube-search';
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
      externalPlayTag = 'youtube-search';
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
    externalPlayTag = 'youtube-search';
    renderGrid(local);
    createPlayers(local, { autoplayFirst: false });
  }

  async function showWeekPopular() {
    if (!$grid) return;
    externalPlayTag = 'youtube-week-popular';
    if ($weekPopularBtn) $weekPopularBtn.disabled = true;
    if ($searchBtn) $searchBtn.disabled = true;
    setSectionTitle('正在加载一周热门…');
    if ($hint) {
      $hint.textContent = '正在从 YouTube 拉取最近 7 天上传的音乐视频，并按播放量从高到低排序…';
    }

    let ytVideos = null;
    let err = null;
    try {
      const r = await fetch('/api/youtube-week-popular');
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.videos && data.videos.length > 0) {
        ytVideos = data.videos;
      } else {
        err = data.error || (r.status === 503 ? 'missing_api_key' : 'fetch_failed');
      }
    } catch (_) {
      err = 'network';
    } finally {
      if ($weekPopularBtn) $weekPopularBtn.disabled = false;
      if ($searchBtn) $searchBtn.disabled = false;
    }

    destroyPlayers();

    if (ytVideos && ytVideos.length) {
      setSectionTitle(`一周热门流行（${ytVideos.length} 个）`);
      const note = '列表为「近 7 天上传 · 音乐分区」并按播放量降序，不区分中文或英文歌曲。';
      if ($hint) $hint.textContent = note;
      renderGrid(ytVideos);
      createPlayers(ytVideos, { autoplayFirst: false });
      return;
    }

    externalPlayTag = 'youtube-search';
    setSectionTitle('一周热门');
    if (err === 'missing_api_key') {
      if ($hint) {
        $hint.textContent =
          '未配置 YOUTUBE_API_KEY，无法拉取 YouTube 一周热门。请在服务器或 Vercel 环境变量中配置后重新部署。';
      }
    } else if (err === 'network') {
      if ($hint) $hint.textContent = '网络错误，无法获取一周热门列表。';
    } else {
      if ($hint) $hint.textContent = '暂时无法获取一周热门（API 错误或配额不足）。';
    }
    $grid.innerHTML =
      '<p class="search-empty" role="status">加载失败。请检查 API 密钥与配额，或稍后再试。</p>';
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
    if ($refreshBatchBtn) {
      $refreshBatchBtn.addEventListener('click', () => {
        showRecommend({ variety: true });
      });
    }
    if ($weekPopularBtn) {
      $weekPopularBtn.addEventListener('click', () => {
        showWeekPopular();
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
