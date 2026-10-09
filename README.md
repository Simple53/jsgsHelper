# DigestLect · 课程学习台

一个可本地运行、可部署到 GitHub Pages 的课程视频学习台。支持系统浅/深色主题、可折叠且可拖拽调宽的左右栏、字幕跳转、学习进度、Obsidian Markdown 导出，以及可选的跨设备进度同步。

## 本地使用

直接打开 `index.html`，或在本目录启动仅本机可访问的静态服务：

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

打开 `http://127.0.0.1:4173/`。进度与笔记默认写入当前浏览器的 `localStorage`，不同浏览器用户互不干扰。

## 主要能力

- 左右侧栏均可折叠，桌面端可拖拽改变宽度，宽度会在本机保存。
- 使用浏览器原生视频控件；没有重复的网页倍速模块。
- 字幕和摘要中的时间点可跳转到视频；笔记中的时间戳可导出为网页回跳链接。
- 笔记可下载为 Obsidian Flavored Markdown，或通过 `obsidian://new` 唤起 Obsidian。
- 同一同步码可在手机和电脑之间合并播放进度与完成状态；个人笔记不会上传。

## 字幕生成

安装一次依赖：

```powershell
python -m pip install -r requirements-subtitles.txt
```

先试跑一讲：

```powershell
python generate_subtitles.py --course 1 --limit 1
python build_webbook.py
```

CPU 默认使用低内存参数的 `small + int8`（1 分钟分块、单束搜索）。有 NVIDIA GPU 时可提高搜索质量与吞吐：

```powershell
python generate_subtitles.py --model small --device cuda --compute-type float16 --chunk-minutes 5 --beam-size 5
python build_webbook.py
```

字幕保存为 `subtitles/<课程>/<课时>.vtt`，可直接随网页代码发布。

## 免费部署架构

- GitHub Pages：网页、课程元数据和 VTT 字幕。
- Cloudflare R2：视频对象。当前视频总量约 7.21 GB，不应提交到普通 Git 仓库。
- Supabase：可选的跨设备进度同步。

推送到 `main` 后，`.github/workflows/pages.yml` 会构建并发布 `_site`。部署时可在 GitHub 仓库中设置：

- Repository variable `VIDEO_BASE_URL`：R2 自定义域名或 `r2.dev` 公网地址。
- Repository variable `SUPABASE_URL`：Supabase 项目 URL。
- Repository secret `SUPABASE_ANON_KEY`：Supabase anon/publishable key。

在 Supabase SQL Editor 执行 `deployment/supabase.sql` 即可创建同步接口。表启用 RLS 且不给匿名角色直接读写权限；网页只能通过同步码的哈希访问对应记录。

## 隐私与仓库边界

`videos/`、本地环境变量、私有配置与构建产物已被 `.gitignore` 排除。`config.js` 只保留空白公开配置，不包含账号、路径、邮箱或访问令牌。Supabase 的浏览器 anon/publishable key本身可公开，但本仓库仍通过 GitHub Secret 注入。

发布视频前请确认你拥有这些课程内容的网络分发权。若只获准个人使用，应将 R2 存储桶保持私有，并改为带身份验证的短期签名 URL，而不是公开链接。
