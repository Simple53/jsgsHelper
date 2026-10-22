<p align="center"><img src="assets/jsgshelper-icon.svg" width="88" alt="jsgsHelper 图标"></p>

<h1 align="center">jsgsHelper</h1>

<p align="center">江苏省高校教师岗前培训学习播放助手 · 离线交互式 Web Book</p>

<p align="center">
  <a href="https://raw.githubusercontent.com/Simple53/jsgsHelper/main/auto_study_assistant.user.js">安装油猴脚本</a> ·
  <a href="#功能">查看功能</a> ·
  <a href="#安装与使用">使用指南</a>
</p>

> 适用于 `jsgs.study.gspxonline.com`。脚本在用户已经登录的学习页面运行，不包含或上传账号、密码、token、cookie。

## 视频 Demo

演示视频制作中，发布后将在此展示操作流程。

<!-- 视频 Demo：将此段替换为视频封面图片和链接，例如 [![演示视频](封面图片地址)](视频地址)。 -->

## 功能

### 在线学习助手：`auto_study_assistant.user.js`

- **后台播放辅助**：尝试阻止页面因切换标签、失焦或最小化而主动暂停，并在视频停滞时尝试恢复。是否持续播放及计入平台进度，仍取决于浏览器、网络和平台规则。
- **五门课程默认连播**：默认顺序为高等教育学（`991`）→ 高等教育心理学（`1088`）→ 高等教育政策与法律（`1072`）→ 高校教师职业道德规范（`993`）→ 习近平总书记教育重要论述（`994`）。可在面板“跨课顺序”中修改或清空课程 ID。
- **课内自动操作**：尝试自动播放视频、切换未完成小节、处理继续学习提示；在文件阅读器中逐页翻阅，并等待平台记录进度。
- **进度同步**：可设定 `0–120` 分钟的刷新间隔（`0` 为关闭），也可手动点“立即刷新”。刷新前暂存视频位置，刷新后尝试恢复；平台进度以服务器记录为准。
- **播放控制**：支持暂停/继续、自动静音、自定义倍速、预设倍速、进度条拖动，以及“结尾静音驻留 / 播完即切 / 循环重播”三种补时策略。
- **紧凑白色悬浮面板**：可拖动、收起为图标，或暂停脚本接管。多窗口使用时，各标签页的跨课顺序分别保存。

### 离线下载与交互式 Web Book

- `batch_downloader.py`：使用 Python 标准库批量下载课程媒体，支持 MP4 流式下载和 M3U8 分片处理；使用前请确认内容授权及平台规则。
- `index.html`、`webbook.js`、`webbook.css`：在本地播放已合法获取的视频，配合字幕与 Markdown 笔记。点击字幕或笔记中的时间标记可跳转播放位置，支持字幕高亮和多集连播。
- `build_webbook.py`：扫描本地视频、字幕与笔记，更新 Web Book 数据。

## 安装与使用

1. 在浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 点击[安装 `auto_study_assistant.user.js`](https://raw.githubusercontent.com/Simple53/jsgsHelper/main/auto_study_assistant.user.js)，按 Tampermonkey 提示安装。若浏览器仅显示源码，可在 Tampermonkey 中新建脚本，复制源码并保存。
3. 用自己的账号登录学习平台，从“我的学习”打开课程。脚本会显示悬浮面板；在课程大厅会按默认队列尝试进入第一门课。
4. 如果账号课程顺序不同，在“跨课顺序”中用逗号填写课程 ID，例如 `991,1088,1072`；离开输入框后保存，刷新页面后更新队列指示。课程 ID 可从课程页地址中的 `/study/course/数字` 或 `#/study/learn/数字` 查看。清空后只处理当前课程。

跨课顺序只存于当前标签会话，不存储登录凭据。其他播放设置保存在该网站的浏览器本地存储中；同一浏览器切换账号时，可检查并调整这些设置。

### 本地 Web Book

如果已获得保存课程材料的许可，可选用以下工具：

```powershell
python batch_downloader.py
python build_webbook.py
```

随后打开 `index.html`。字幕和笔记由相应生成工具或本地文件提供；下载器与 Web Book 不影响在线学习脚本的使用。

## 项目文件

```text
jsgsHelper/
├── auto_study_assistant.user.js  # 在线油猴脚本，5.0 系列
├── assets/jsgshelper-icon.svg    # 项目图标
├── test_auto_study_assistant.js  # 脚本回归检查
├── index.html                    # 离线 Web Book 入口
├── webbook.js / webbook.css      # 播放器、字幕和界面
├── course_data.js                # Web Book 数据
├── batch_downloader.py          # 课程媒体下载工具
├── build_webbook.py             # 本地数据同步工具
├── course_videos.json           # 课程媒体元数据
└── summaries/                   # 示例 Markdown 笔记
```

## 常见问题

**为什么倍速播完后，平台进度还没满？** 平台可能按实际观看时间或其他规则计算学习时长。可切换补时策略、使用 `1.0x` 播放，并以平台刷新后的记录为准；脚本不能保证补足学时。

**切到其他程序后一定会继续播放吗？** 不能保证。脚本会尝试阻止页面主动暂停，但浏览器节流、系统休眠、网络断开或平台校验仍可能使播放和进度停止。外接显示屏本身不改变此规则。

**进入页面没有自动播放？** 浏览器可能要求用户先与页面交互。点一次原生播放按钮或面板中的“继续播放”后再观察。

**如何手动学习？** 点击面板“接管中”切换为“已暂停”，即可停止脚本自动操作。必要时可在 Tampermonkey 中禁用脚本并刷新页面，以恢复未被页面加载时拦截的原生行为。

## 免责声明

本项目用于个人学习辅助与技术交流。请遵守平台规则及课程内容授权；学习时长与进度以平台实际记录和审核结果为准。发布或反馈问题时，请勿附带个人 token、cookie、账号信息或抓包数据。
