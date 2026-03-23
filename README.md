# Latest News Website

A small website that fetches the **10 latest news** articles from live RSS feeds and **selects the single latest** one, showing it in a highlighted “Latest” section at the top.

## Run it

```bash
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

### Connection failed (Error -102)?

That usually means the server isn’t running. Do this **before** opening the URL:

1. **Install Node.js** if needed: [nodejs.org](https://nodejs.org) (LTS).
2. Open a terminal (Terminal.app, iTerm, or VS Code integrated terminal).
3. Go to the project folder:
   ```bash
   cd /Users/hanyusheng99/Documents/ai_study/project1
   ```
4. Install and start:
   ```bash
   npm install
   npm start
   ```
5. When you see `News server running at http://localhost:3000`, open that URL in your browser.

Leave the terminal open while you use the site; closing it stops the server.

### 本地访问不了？

1. **必须用「网址」打开，不要直接打开 HTML 文件**  
   在浏览器地址栏输入：**http://localhost:3000**  
   不要用「打开文件」或 `file:///.../index.html`，否则接口 `/api/news` 会请求失败。

2. **先启动服务器**  
   在项目目录执行：
   ```bash
   cd /Users/hanyusheng99/Documents/ai_study/project1
   npm start
   ```
   看到 `News server running at http://localhost:3000` 后再用浏览器访问。

3. **端口被占用**  
   若 3000 端口已被占用，可指定其他端口再启动：
   ```bash
   PORT=3001 npm start
   ```
   然后访问 **http://localhost:3001**。

## What it does

- **Backend** (`server.js`): Fetches headlines from BBC, NYT, and NPR RSS feeds, merges and sorts by date, and returns the 10 most recent via `/api/news`.
- **Frontend**: Requests `/api/news`, shows all 10 in a list and **features the very latest** in a “Latest” box at the top with a gold-style highlight.

The “latest” is simply the first of the 10 (newest by publication date).

---

## 音乐页与 YouTube 搜索（`/music.html`）

打开 **http://localhost:3000/music.html**（或线上 `/music.html`）。搜索框会请求 **`/api/youtube-search`**，使用 [YouTube Data API v3](https://developers.google.com/youtube/v3) 拉取最多 **15** 条视频并在本页用播放器展示。

「**一周热门流行**」按钮会请求 **`/api/youtube-week-popular`**：优先列出「近 7 天上传 · 音乐分区 · 按播放量」的视频；若结果较少，会补充台湾地区 **YouTube 音乐热门榜**（`chart=mostPopular`）。

### 配置 `YOUTUBE_API_KEY`

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 创建/选择项目，启用 **YouTube Data API v3**，在「凭据」里创建 **API 密钥**。
2. **本地**：任选其一  
   - 在项目根目录创建 `.env`（可参考 `.env.example`），写入 `YOUTUBE_API_KEY=你的密钥`，然后 `npm start`（`server.js` 会自动加载 `.env`）。  
   - 或在终端执行：`export YOUTUBE_API_KEY="你的密钥"` 后再 `npm start`。
3. **Vercel**：项目 **Settings → Environment Variables** 中添加 `YOUTUBE_API_KEY`，保存后重新部署。

未配置密钥或接口失败时，搜索会**自动退回**站内曲库（`public/music-catalog.js`）的文本匹配。

---

## 发布到你的域名（如 hkcompass.org）

本项目已支持 [Vercel](https://vercel.com) 部署，部署后可绑定自定义域名 **https://hkcompass.org/**。

### 1. 用 GitHub 登录 Vercel

1. 打开 [vercel.com](https://vercel.com) → **Sign Up** / **Log in**。
2. 选择 **Continue with GitHub**，授权 Vercel 访问你的 GitHub。

### 2. 从 GitHub 导入项目

1. 在 Vercel 控制台点击 **Add New…** → **Project**。
2. 在 **Import Git Repository** 里选择 **hanyushenghk/project1**（或你的仓库名）。
3. **Framework Preset** 保持 **Other** 即可，无需改。
4. 点击 **Deploy**，等待构建完成。

### 3. 绑定域名 hkcompass.org

1. 在 Vercel 中打开刚部署的项目 → 顶部 **Settings** → 左侧 **Domains**。
2. 在 **Domain** 输入框填写：`hkcompass.org`，再点 **Add**。
3. 若希望带 `www`，再添加：`www.hkcompass.org`。
4. 按页面提示到你的域名注册商（如 Cloudflare、GoDaddy、阿里云等）修改 **DNS**：
   - 添加 **A 记录**：主机记录 `@`，指向 Vercel 给出的 IP（通常是 `76.76.21.21`）。
   - 或添加 **CNAME 记录**：主机记录 `www`，指向 `cname.vercel-dns.com`（以 Vercel 页面显示为准）。
5. 保存 DNS 后等待生效（几分钟到几十分钟），Vercel 会为域名自动配置 HTTPS。

### 4. 之后更新网站

每次向 GitHub 仓库 **push** 代码，Vercel 会自动重新部署，你的 **https://hkcompass.org/** 会更新为最新版本。
