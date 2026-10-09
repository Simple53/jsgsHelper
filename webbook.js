document.addEventListener("DOMContentLoaded", () => {
  const courses = window.__COURSE_DATA__ || [];
  const appConfig = window.__DIGESTLECT_CONFIG__ || {};
  const $ = (id) => document.getElementById(id);
  const player = $("player");
  const courseTree = $("course-tree");
  const searchInput = $("search-input");
  const transcriptContainer = $("transcript-container");
  const summaryContainer = $("summary-container");
  const notesEditor = $("notes-editor");
  const obsidianDialog = $("obsidian-dialog");
  const syncDialog = $("sync-dialog");
  let currentCourse = null;
  let currentLesson = null;
  let activeCue = null;
  let saveTimer = null;
  let toastTimer = null;
  let panelsBeforeFocus = null;
  let cloudTimer = null;
  let cloudSyncing = false;

  const savedSidebarWidth = Number(localStorage.getItem("digestlect:sidebar-width"));
  const savedInspectorWidth = Number(localStorage.getItem("digestlect:inspector-width"));
  if (savedSidebarWidth) document.documentElement.style.setProperty("--sidebar-width", `${Math.min(420, Math.max(210, savedSidebarWidth))}px`);
  if (savedInspectorWidth) document.documentElement.style.setProperty("--inspector-width", `${Math.min(600, Math.max(300, savedInspectorWidth))}px`);

  $("course-count").textContent = `${courses.length} 门课程`;
  $("ready-count").textContent = courses.reduce((count, course) => count + course.videos.filter((lesson) => lesson.videoExists).length, 0);
  updateCompleteCount();
  $("vault-name").value = localStorage.getItem("webbook:obsidian-vault") || "";
  $("note-folder").value = localStorage.getItem("webbook:obsidian-folder") || "课程笔记";

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function formatTime(seconds, includeHours = false) {
    const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = Math.floor(safe % 60);
    return hours || includeHours
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function parseTimeString(value) {
    return value.split(":").reduce((total, part) => total * 60 + Number(part), 0);
  }

  function noteKey() {
    return currentLesson ? `webbook:note:${currentLesson.sourceId}` : "webbook:note:none";
  }

  function progressKey() {
    return currentLesson ? `webbook:progress:${currentLesson.sourceId}` : "webbook:progress:none";
  }

  function completeKey(lesson) {
    return `webbook:completed:${lesson.sourceId}`;
  }

  function updateCompleteCount() {
    $("complete-count").textContent = courses.reduce((count, course) => count + course.videos.filter((lesson) => localStorage.getItem(completeKey(lesson)) === "1").length, 0);
  }

  function updateCompleteButton() {
    const completed = Boolean(currentLesson && localStorage.getItem(completeKey(currentLesson)) === "1");
    const label = completed ? "取消本课完成标记" : "标记本课完成";
    $("complete-button").setAttribute("aria-pressed", String(completed));
    $("complete-button").setAttribute("aria-label", label);
    $("complete-button").setAttribute("title", label);
  }

  function setCompleted(completed) {
    if (!currentLesson) return;
    if (completed) localStorage.setItem(completeKey(currentLesson), "1");
    else localStorage.removeItem(completeKey(currentLesson));
    updateCompleteCount();
    updateCompleteButton();
    renderCourseTree(searchInput.value);
    queueCloudSync();
  }

  function setPanel(side, collapsed) {
    const isLeft = side === "left";
    document.body.classList.toggle(`${side}-collapsed`, collapsed);
    const button = $(isLeft ? "menu-button" : "inspector-button");
    const label = isLeft && matchMedia("(max-width: 860px)").matches
      ? "打开课程目录"
      : `${collapsed ? "展开" : "收起"}${isLeft ? "课程目录" : "学习面板"}`;
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.setAttribute("aria-expanded", String(!collapsed));
    if (!isLeft) document.body.classList.remove("right-panel-open");
  }

  function setupResizer(id, side) {
    const handle = $(id);
    if (!handle) return;
    const isLeft = side === "left";
    const cssVariable = isLeft ? "--sidebar-width" : "--inspector-width";
    const storageKey = isLeft ? "digestlect:sidebar-width" : "digestlect:inspector-width";
    const min = isLeft ? 210 : 300;
    const max = isLeft ? 420 : 600;
    const update = (clientX) => {
      const raw = isLeft ? clientX : window.innerWidth - clientX;
      const width = Math.round(Math.min(max, Math.max(min, raw)));
      document.documentElement.style.setProperty(cssVariable, `${width}px`);
      localStorage.setItem(storageKey, String(width));
    };
    handle.addEventListener("pointerdown", (event) => {
      if (matchMedia("(max-width: 860px)").matches) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add("resizing");
    });
    handle.addEventListener("pointermove", (event) => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      update(event.clientX);
    });
    const stop = (event) => {
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      document.body.classList.remove("resizing");
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
    handle.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(cssVariable)) || min;
      const delta = event.key === "ArrowRight" ? 12 : -12;
      const next = isLeft ? current + delta : current - delta;
      const width = Math.min(max, Math.max(min, next));
      document.documentElement.style.setProperty(cssVariable, `${width}px`);
      localStorage.setItem(storageKey, String(Math.round(width)));
    });
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function normalizeSyncCode(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").match(/.{1,4}/g)?.join("-") || "";
  }

  function generateSyncCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("").match(/.{4}/g).join("-");
  }

  function getLocalSyncState() {
    const state = { version: 1, progress: {}, completed: {}, updatedAt: Date.now() };
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("webbook:progress:")) state.progress[key.slice(17)] = Number(localStorage.getItem(key)) || 0;
      if (key?.startsWith("webbook:completed:") && localStorage.getItem(key) === "1") state.completed[key.slice(18)] = true;
    }
    return state;
  }

  function mergeCloudState(remote = {}) {
    Object.entries(remote.progress || {}).forEach(([lessonId, seconds]) => {
      const key = `webbook:progress:${lessonId}`;
      const merged = Math.max(Number(localStorage.getItem(key)) || 0, Number(seconds) || 0);
      if (merged) localStorage.setItem(key, String(Math.floor(merged)));
    });
    Object.keys(remote.completed || {}).forEach((lessonId) => localStorage.setItem(`webbook:completed:${lessonId}`, "1"));
    updateCompleteCount();
    updateCompleteButton();
    renderCourseTree(searchInput.value);
  }

  function syncConfigured() {
    return Boolean(appConfig.supabaseUrl && appConfig.supabaseAnonKey);
  }

  async function callSyncRpc(name, body) {
    const base = String(appConfig.supabaseUrl).replace(/\/$/, "");
    const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: appConfig.supabaseAnonKey,
        Authorization: `Bearer ${appConfig.supabaseAnonKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`同步服务返回 ${response.status}`);
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function cloudSync(showFeedback = false) {
    const code = normalizeSyncCode(localStorage.getItem("digestlect:sync-code"));
    if (!code || !syncConfigured() || cloudSyncing) return;
    cloudSyncing = true;
    $("sync-status").textContent = "正在合并进度…";
    try {
      const remote = await callSyncRpc("get_digestlect_state", { p_key: code });
      if (remote) mergeCloudState(remote);
      await callSyncRpc("set_digestlect_state", { p_key: code, p_payload: getLocalSyncState() });
      $("sync-status").textContent = `已同步 · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      $("sync-button").classList.add("synced");
      if (showFeedback) showToast("学习进度已同步");
    } catch (error) {
      $("sync-status").textContent = `同步失败：${error.message}`;
      $("sync-button").classList.remove("synced");
      if (showFeedback) showToast("同步失败，请检查云端配置");
    } finally {
      cloudSyncing = false;
    }
  }

  function queueCloudSync() {
    if (!syncConfigured() || !localStorage.getItem("digestlect:sync-code")) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => cloudSync(false), 2500);
  }

  function switchTab(tabName) {
    document.querySelectorAll(".tab-btn").forEach((button) => button.classList.toggle("active", button.dataset.tab === tabName));
    document.querySelectorAll(".tab-pane").forEach((pane) => pane.classList.toggle("active", pane.id === `${tabName}-pane`));
  }

  function renderCourseTree(filter = "") {
    const needle = filter.trim().toLowerCase();
    courseTree.replaceChildren();

    courses.forEach((course) => {
      const visibleLessons = course.videos.filter((lesson) => `${lesson.title} ${lesson.summary || ""}`.toLowerCase().includes(needle));
      if (needle && !visibleLessons.length) return;

      const group = document.createElement("section");
      group.className = "course-group";
      const title = document.createElement("button");
      title.className = "course-title";
      title.setAttribute("aria-expanded", "true");
      title.innerHTML = `<span class="course-number">${escapeHtml(course.index)}</span><span class="course-title-name">${escapeHtml(course.courseName)}</span><span class="course-total">${course.videos.length}</span><svg class="icon course-chevron" aria-hidden="true"><use href="#i-chevron"/></svg>`;
      const list = document.createElement("ul");
      list.className = "lesson-list";

      visibleLessons.forEach((lesson) => {
        const item = document.createElement("li");
        item.className = "lesson-item";
        if (currentLesson?.sourceId === lesson.sourceId) item.classList.add("active");
        const completed = localStorage.getItem(completeKey(lesson)) === "1";
        const status = completed ? "completed" : lesson.videoExists ? "local" : "remote";
        const statusText = completed ? "已完成" : lesson.videoExists ? "已下载，未完成" : "尚未下载";
        item.innerHTML = `<span class="status-dot ${status}" title="${statusText}" aria-label="${statusText}">${completed ? '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>' : ""}</span><span class="lesson-name">${escapeHtml(lesson.title)}</span><span class="lesson-index">${String(lesson.index).padStart(2, "0")}</span>`;
        item.addEventListener("click", () => {
          selectLesson(course, lesson);
          document.body.classList.remove("sidebar-open");
        });
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
        item.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); item.click(); }
        });
        list.appendChild(item);
      });

      title.addEventListener("click", () => {
        const collapsed = group.classList.toggle("collapsed");
        title.setAttribute("aria-expanded", String(!collapsed));
      });
      group.append(title, list);
      courseTree.appendChild(group);
    });
  }

  function updateUrl(seconds) {
    if (!currentCourse || !currentLesson || location.protocol === "file:") return;
    const url = new URL(location.href);
    url.searchParams.set("course", currentCourse.index);
    url.searchParams.set("lesson", currentLesson.sourceId);
    if (Number.isFinite(seconds) && seconds > 0) url.searchParams.set("t", Math.floor(seconds));
    else url.searchParams.delete("t");
    history.replaceState(null, "", url);
  }

  function selectLesson(course, lesson, startAt = 0) {
    currentCourse = course;
    currentLesson = lesson;
    activeCue = null;
    $("current-course-badge").textContent = `${course.index}. ${course.courseName}`;
    $("lesson-position").textContent = `第 ${lesson.index} 讲`;
    $("current-title").textContent = lesson.title;
    const videoBaseUrl = String(appConfig.videoBaseUrl || "").replace(/\/$/, "");
    const videoAvailable = lesson.videoExists && (!appConfig.hosted || videoBaseUrl);
    $("lesson-status").textContent = videoAvailable ? (videoBaseUrl ? "云端视频" : "本地视频") : "视频未上线";
    $("lesson-duration").textContent = "--:--";
    $("progress-label").textContent = "0%";
    $("progress-bar").style.width = "0%";
    updateCompleteButton();
    renderCourseTree(searchInput.value);

    player.pause();
    player.removeAttribute("src");
    document.getElementById("vtt-track")?.remove();
    if (videoAvailable) {
      $("video-notice").classList.remove("show");
      player.style.display = "block";
      const encodedPath = lesson.videoPath.split("/").map(encodeURIComponent).join("/");
      player.src = videoBaseUrl ? `${videoBaseUrl}/${encodedPath}` : lesson.videoPath;
      if (lesson.vttExists) {
        const track = document.createElement("track");
        Object.assign(track, { id: "vtt-track", kind: "subtitles", label: "中文", srclang: "zh", src: lesson.vttPath, default: true });
        player.appendChild(track);
      }
      player.load();
      player.addEventListener("loadedmetadata", () => {
        $("lesson-duration").textContent = formatTime(player.duration);
        const saved = Number(localStorage.getItem(progressKey())) || 0;
        const target = startAt || saved;
        if (target > 0 && target < player.duration - 2) player.currentTime = target;
        updateProgress();
      }, { once: true });
    } else {
      player.style.display = "none";
      const notice = $("video-notice");
      notice.classList.add("show");
      notice.innerHTML = appConfig.hosted
        ? `<div><p>该课时的视频存储尚未接入</p><p>字幕、笔记与学习进度仍可正常使用。</p></div>`
        : `<div><p>该课时尚未下载到本地</p><code>${escapeHtml(lesson.videoPath)}</code><p>运行 <code>python batch_downloader.py --course ${escapeHtml(course.index)}</code></p>${lesson.onlineUrl ? `<a href="${escapeHtml(lesson.onlineUrl)}" target="_blank" rel="noreferrer">查看在线源地址</a>` : ""}</div>`;
    }

    renderTranscript(lesson.cues || []);
    renderSummary(lesson.summary || "");
    notesEditor.value = localStorage.getItem(noteKey()) || "";
    updateNoteDot();
    updateUrl(startAt);
  }

  function renderTranscript(cues) {
    transcriptContainer.replaceChildren();
    if (!cues.length) {
      transcriptContainer.innerHTML = `<div class="empty-state">当前课时暂无字幕。<br>加入 VTT 后会自动显示在这里。</div>`;
      return;
    }
    const list = document.createElement("div");
    list.className = "transcript-list";
    cues.forEach((cue) => {
      const item = document.createElement("article");
      item.className = "transcript-cue";
      item.dataset.start = cue.start;
      item.dataset.end = cue.end;
      item.innerHTML = `<time class="transcript-time">${escapeHtml(cue.startText || formatTime(cue.start))}</time><div class="transcript-text">${escapeHtml(cue.text)}</div>`;
      item.addEventListener("click", () => seekTo(cue.start));
      list.appendChild(item);
    });
    transcriptContainer.appendChild(list);
  }

  function markdownToHtml(markdown) {
    let html = escapeHtml(markdown)
      .replace(/^### (.+)$/gim, "<h3>$1</h3>")
      .replace(/^## (.+)$/gim, "<h2>$1</h2>")
      .replace(/^# (.+)$/gim, "<h1>$1</h1>")
      .replace(/^&gt; (.+)$/gim, "<blockquote>$1</blockquote>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
      .replace(/^- (.+)$/gim, "<li>$1</li>")
      .replace(/\n{2,}/g, "<p></p>");
    return html.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (_, time) => `<button class="timestamp-pill" data-time="${parseTimeString(time)}" title="跳转到 ${time}" aria-label="跳转到 ${time}"><svg class="icon" aria-hidden="true"><use href="#i-play"/></svg>${time}</button>`);
  }

  function renderSummary(markdown) {
    summaryContainer.replaceChildren();
    if (!markdown) {
      summaryContainer.innerHTML = `<div class="empty-state">当前课时还没有结构化提要。</div>`;
      return;
    }
    summaryContainer.innerHTML = `<article class="markdown-body">${markdownToHtml(markdown)}</article>`;
    summaryContainer.querySelectorAll(".timestamp-pill").forEach((button) => button.addEventListener("click", () => seekTo(Number(button.dataset.time))));
  }

  function seekTo(seconds) {
    if (!currentLesson?.videoExists) return showToast("请先下载该课时视频");
    player.currentTime = seconds;
    player.play().catch(() => {});
    updateUrl(seconds);
  }

  function updateProgress() {
    const percent = player.duration ? Math.min(100, Math.round(player.currentTime / player.duration * 100)) : 0;
    $("progress-label").textContent = `${percent}%`;
    $("progress-bar").style.width = `${percent}%`;
    if (currentLesson && Number.isFinite(player.currentTime)) {
      localStorage.setItem(progressKey(), String(Math.floor(player.currentTime)));
      queueCloudSync();
    }
  }

  function updateActiveCue() {
    const time = player.currentTime;
    const next = Array.from(document.querySelectorAll(".transcript-cue")).find((cue) => time >= Number(cue.dataset.start) && time < Number(cue.dataset.end));
    if (next === activeCue) return;
    activeCue?.classList.remove("active");
    activeCue = next || null;
    if (activeCue) {
      activeCue.classList.add("active");
      activeCue.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function insertTimestamp() {
    if (!currentLesson) return;
    const stamp = `[${formatTime(player.currentTime)}] `;
    const start = notesEditor.selectionStart;
    const end = notesEditor.selectionEnd;
    notesEditor.setRangeText(stamp, start, end, "end");
    notesEditor.focus();
    saveNotes();
    switchTab("notes");
  }

  function saveNotes() {
    if (!currentLesson) return;
    localStorage.setItem(noteKey(), notesEditor.value);
    $("save-status").textContent = "已自动保存";
    updateNoteDot();
  }

  function updateNoteDot() {
    $("note-dot").classList.toggle("visible", Boolean(notesEditor.value.trim()));
  }

  function lessonUrl(seconds) {
    if (location.protocol === "file:") return "";
    const url = new URL(location.href);
    url.searchParams.set("course", currentCourse.index);
    url.searchParams.set("lesson", currentLesson.sourceId);
    url.searchParams.set("t", String(seconds));
    return url.toString();
  }

  function linkTimestamps(text) {
    return text.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (match, time) => {
      const url = lessonUrl(parseTimeString(time));
      return url ? `[${time}](${url})` : match;
    });
  }

  function buildMarkdown() {
    if (!currentCourse || !currentLesson) return "";
    const title = `${currentCourse.courseName} · ${currentLesson.title}`;
    const source = lessonUrl(Math.floor(player.currentTime));
    const note = notesEditor.value.trim() || "- ";
    return `---\ntitle: "${title.replace(/"/g, "\\\"")}"\ncourse: "${currentCourse.courseName.replace(/"/g, "\\\"")}"\nlesson: ${currentLesson.index}\ntags:\n  - 课程笔记\n  - 岗前培训\n${source ? `source: "${source}"\n` : ""}---\n\n# ${title}\n\n> [!info] 课程定位\n> ${source ? `[回到视频 ${formatTime(player.currentTime)}](${source})` : `视频时间 ${formatTime(player.currentTime)}`}\n\n## 我的笔记\n\n${linkTimestamps(note)}\n`;
  }

  function safeFileName(value) {
    return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
  }

  function downloadMarkdown() {
    if (!currentLesson) return;
    const blob = new Blob([buildMarkdown()], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${safeFileName(currentCourse.courseName)} - ${safeFileName(currentLesson.title)}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("Markdown 笔记已下载");
  }

  function openObsidian() {
    const vault = $("vault-name").value.trim();
    const folder = $("note-folder").value.trim() || "课程笔记";
    if (!vault) {
      $("vault-name").focus();
      return showToast("请先填写 Obsidian 仓库名称");
    }
    localStorage.setItem("webbook:obsidian-vault", vault);
    localStorage.setItem("webbook:obsidian-folder", folder);
    const name = `${folder}/${safeFileName(currentCourse.courseName)} - ${safeFileName(currentLesson.title)}`;
    const uri = `obsidian://new?vault=${encodeURIComponent(vault)}&name=${encodeURIComponent(name)}&content=${encodeURIComponent(buildMarkdown())}`;
    location.href = uri;
    showToast("正在打开 Obsidian…");
  }

  function playNextLesson() {
    if (!currentCourse || !currentLesson) return;
    const curIdx = currentCourse.videos.findIndex(v => v.sourceId === currentLesson.sourceId);
    if (curIdx >= 0 && curIdx < currentCourse.videos.length - 1) {
      const nextLesson = currentCourse.videos[curIdx + 1];
      showToast(`正在自动播放下一讲：${nextLesson.title}`);
      selectLesson(currentCourse, nextLesson);
      player.play().catch(() => {});
    } else {
      const nextCourseIdx = courses.findIndex(c => c.courseId === currentCourse.courseId) + 1;
      if (nextCourseIdx < courses.length && courses[nextCourseIdx].videos.length > 0) {
        const nextCourse = courses[nextCourseIdx];
        showToast(`已切换至下一门课程：${nextCourse.courseName}`);
        selectLesson(nextCourse, nextCourse.videos[0]);
        player.play().catch(() => {});
      } else {
        showToast("全部课程已连播完毕！");
      }
    }
  }

  player.addEventListener("timeupdate", () => { updateProgress(); updateActiveCue(); });
  player.addEventListener("ended", () => {
    updateProgress();
    setCompleted(true);
    if ($("auto-next-check")?.checked) {
      setTimeout(playNextLesson, 1200);
    }
  });
  $("complete-button").addEventListener("click", () => setCompleted($("complete-button").getAttribute("aria-pressed") !== "true"));
  searchInput.addEventListener("input", (event) => renderCourseTree(event.target.value));
  searchInput.addEventListener("keydown", (event) => { if (event.key === "Escape") { searchInput.value = ""; renderCourseTree(); searchInput.blur(); } });
  document.addEventListener("keydown", (event) => { if (event.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") { event.preventDefault(); searchInput.focus(); } });
  document.querySelectorAll(".tab-btn").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
  notesEditor.addEventListener("input", () => {
    $("save-status").textContent = "保存中…";
    updateNoteDot();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNotes, 350);
  });
  $("insert-time").addEventListener("click", insertTimestamp);
  $("copy-markdown").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(buildMarkdown()); showToast("已复制 Obsidian Markdown"); }
    catch { showToast("复制失败，请使用下载功能"); }
  });
  $("download-note").addEventListener("click", downloadMarkdown);
  $("dialog-download").addEventListener("click", downloadMarkdown);
  $("open-obsidian").addEventListener("click", openObsidian);
  $("obsidian-button").addEventListener("click", () => obsidianDialog.showModal());
  $("sync-button").addEventListener("click", () => {
    $("sync-code").value = normalizeSyncCode(localStorage.getItem("digestlect:sync-code"));
    $("sync-status").textContent = syncConfigured() ? ($("sync-code").value ? "已连接，可立即同步" : "尚未连接") : "云同步尚未配置；本地存档不受影响";
    syncDialog.showModal();
  });
  $("generate-sync-code").addEventListener("click", () => {
    $("sync-code").value = generateSyncCode();
    $("sync-code").focus();
    $("sync-code").select();
  });
  $("copy-sync-code").addEventListener("click", async () => {
    const code = normalizeSyncCode($("sync-code").value);
    if (!code) return showToast("请先生成或输入同步码");
    try { await navigator.clipboard.writeText(code); showToast("同步码已复制"); }
    catch { showToast("复制失败，请手动复制"); }
  });
  $("sync-code").addEventListener("input", (event) => { event.target.value = normalizeSyncCode(event.target.value); });
  $("connect-sync").addEventListener("click", async () => {
    const code = normalizeSyncCode($("sync-code").value);
    if (code.replace(/-/g, "").length !== 16) return showToast("请输入 16 位同步码");
    localStorage.setItem("digestlect:sync-code", code);
    if (!syncConfigured()) return showToast("请先完成云同步配置");
    await cloudSync(true);
  });
  $("focus-button").addEventListener("click", () => {
    if (panelsBeforeFocus) {
      setPanel("left", panelsBeforeFocus.left);
      setPanel("right", panelsBeforeFocus.right);
      panelsBeforeFocus = null;
    } else {
      panelsBeforeFocus = { left: document.body.classList.contains("left-collapsed"), right: document.body.classList.contains("right-collapsed") };
      setPanel("left", true);
      setPanel("right", true);
    }
    const active = Boolean(panelsBeforeFocus);
    $("focus-button").setAttribute("aria-pressed", String(active));
    $("focus-button").setAttribute("aria-label", active ? "退出专注模式" : "专注模式");
    $("focus-button").setAttribute("title", active ? "退出专注模式" : "专注模式");
  });
  $("menu-button").addEventListener("click", () => {
    if (matchMedia("(max-width: 860px)").matches) return document.body.classList.add("sidebar-open");
    setPanel("left", !document.body.classList.contains("left-collapsed"));
  });
  $("inspector-button").addEventListener("click", () => setPanel("right", !document.body.classList.contains("right-collapsed")));
  $("sidebar-close").addEventListener("click", () => document.body.classList.remove("sidebar-open"));
  $("sidebar-scrim").addEventListener("click", () => document.body.classList.remove("sidebar-open"));
  const sidebarBreakpoint = matchMedia("(max-width: 860px)");
  sidebarBreakpoint.addEventListener("change", () => setPanel("left", document.body.classList.contains("left-collapsed")));
  setupResizer("sidebar-resizer", "left");
  setupResizer("inspector-resizer", "right");
  setPanel("left", false);
  if (localStorage.getItem("digestlect:sync-code")) cloudSync(false);

  renderCourseTree();
  const params = new URLSearchParams(location.search);
  const requestedLesson = params.get("lesson");
  const requestedTime = Number(params.get("t")) || 0;
  let initialCourse = courses[0];
  let initialLesson = initialCourse?.videos[0];
  if (requestedLesson) {
    for (const course of courses) {
      const lesson = course.videos.find((item) => String(item.sourceId) === requestedLesson);
      if (lesson) { initialCourse = course; initialLesson = lesson; break; }
    }
  }
  if (initialCourse && initialLesson) selectLesson(initialCourse, initialLesson, requestedTime);

  if (params.get("selftest") === "1") {
    console.assert(parseTimeString("01:02") === 62, "时间戳解析失败");
    console.assert(formatTime(62) === "01:02", "时间格式化失败");
    console.assert(buildMarkdown().includes("## 我的笔记"), "Obsidian Markdown 生成失败");
  }
});
