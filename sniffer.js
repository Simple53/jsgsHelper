// ==UserScript==
// @name         课程视频资源全自动嗅探与批量导出工具
// @description  自动拦截课程目录API、监听播放器请求、支持自动遍历课时与导出 course_videos.json
// ==/UserScript==

(function () {
    console.log("%c[视频嗅探器] 脚本已成功注入！", "color: #10b981; font-size: 16px; font-weight: bold;");

    // 全局存储池
    window.__SNIFFER_DATA__ = window.__SNIFFER_DATA__ || {
        videos: new Map(), // key: url/id, value: { title, url, type, time }
        chapters: []
    };

    const store = window.__SNIFFER_DATA__;

    // 辅助：规范化添加到存储池
    function addVideoRecord(title, url, extra = {}) {
        if (!url || typeof url !== 'string') return;
        // 过滤非媒体请求
        const isMedia = url.includes('.mp4') || url.includes('.m3u8') || url.includes('.flv') || url.includes('/play') || url.includes('video');
        if (!isMedia && !extra.force) return;

        // 规范化名称与去重
        const cleanTitle = (title || extra.chapterTitle || document.title || '未命名课时').replace(/[\\/:*?"<>|]/g, "_").trim();
        
        if (!store.videos.has(url)) {
            store.videos.set(url, {
                id: store.videos.size + 1,
                title: cleanTitle,
                url: url,
                type: url.includes('.m3u8') ? 'm3u8' : 'mp4',
                detectedAt: new Date().toLocaleTimeString(),
                ...extra
            });
            console.log(`%c[发现视频] ${cleanTitle} => ${url}`, "color: #0284c7; font-weight: bold;");
            updateUI();
        }
    }

    // 1. 深度拦截 XMLHttpRequest
    const rawXHR = window.XMLHttpRequest.prototype.open;
    const rawSend = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.open = function (method, url) {
        this._sniffer_url = url;
        return rawXHR.apply(this, arguments);
    };
    window.XMLHttpRequest.prototype.send = function () {
        this.addEventListener('load', function () {
            try {
                const url = this._sniffer_url;
                if (url.includes('.mp4') || url.includes('.m3u8')) {
                    addVideoRecord(getCurrentActiveLessonTitle(), url);
                }
                // 如果是 JSON 响应，尝试深度解析课程目录或播放链接
                const contentType = this.getResponseHeader('content-type') || '';
                if (contentType.includes('application/json') || contentType.includes('text/plain')) {
                    const text = this.responseText;
                    if (text && (text.includes('.mp4') || text.includes('.m3u8') || text.includes('videoUrl') || text.includes('playUrl'))) {
                        parseMediaJson(text);
                    }
                }
            } catch (e) {}
        });
        return rawSend.apply(this, arguments);
    };

    // 2. 深度拦截 Fetch
    const rawFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await rawFetch.apply(this, args);
        try {
            const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
            if (url.includes('.mp4') || url.includes('.m3u8')) {
                addVideoRecord(getCurrentActiveLessonTitle(), url);
            }
            // 复制 response 进行分析
            const clone = response.clone();
            clone.text().then(text => {
                if (text && (text.includes('.mp4') || text.includes('.m3u8') || text.includes('videoUrl') || text.includes('playUrl'))) {
                    parseMediaJson(text);
                }
            }).catch(() => {});
        } catch (e) {}
        return response;
    };

    // 3. 递归解析 JSON 数据包中的视频直链
    function parseMediaJson(rawText) {
        try {
            const data = JSON.parse(rawText);
            function recursiveSearch(obj, parentTitle = '') {
                if (!obj || typeof obj !== 'object') return;
                const currentTitle = obj.name || obj.title || obj.chapterName || obj.sectionName || obj.courseName || parentTitle;
                
                // 常见字段名
                const possibleUrl = obj.url || obj.videoUrl || obj.playUrl || obj.m3u8Url || obj.video_url || obj.streamUrl || obj.src;
                if (typeof possibleUrl === 'string' && (possibleUrl.includes('.mp4') || possibleUrl.includes('.m3u8'))) {
                    addVideoRecord(currentTitle, possibleUrl);
                }
                
                for (const key in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, key)) {
                        recursiveSearch(obj[key], currentTitle);
                    }
                }
            }
            recursiveSearch(data);
        } catch (e) {}
    }

    // 4. DOM 视频标签监听 (HTML5 video, source)
    setInterval(() => {
        document.querySelectorAll('video, source').forEach(v => {
            const src = v.src || v.currentSrc;
            if (src && !src.startsWith('blob:') && (src.includes('.mp4') || src.includes('.m3u8'))) {
                addVideoRecord(getCurrentActiveLessonTitle(), src);
            }
        });
    }, 1500);

    // 辅助获取当前正在播放或高亮的课时名称
    function getCurrentActiveLessonTitle() {
        // 尝试常见的激活类名
        const activeEl = document.querySelector('.active, .current, .is-active, .selected, [class*="active"]');
        if (activeEl) {
            const text = activeEl.innerText.trim().split('\n')[0];
            if (text && text.length < 50) return text;
        }
        return document.title || '课时';
    }

    // 5. 自动遍历点击课时（如果需要自动触发所有视频）
    let isAutoScanning = false;
    async function startAutoScan() {
        if (isAutoScanning) return;
        isAutoScanning = true;
        
        // 查找章节列表中所有可点击的节
        const candidates = Array.from(document.querySelectorAll('li, div, a, span')).filter(el => {
            const t = el.innerText || '';
            // 包含"第X讲"、"课时"、"节"或时长格式如 "00:" 等标识
            return (t.includes('节') || t.includes('课') || t.includes('讲') || /\d{1,2}:\d{2}/.test(t)) && el.children.length <= 3 && el.offsetHeight > 0;
        });

        const statusEl = document.getElementById('sniffer-status');
        if (statusEl) statusEl.innerText = `找到 ${candidates.length} 个潜在课时，开始自动巡检...`;

        for (let i = 0; i < candidates.length; i++) {
            if (!isAutoScanning) break;
            const item = candidates[i];
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
            item.click();
            if (statusEl) statusEl.innerText = `巡检中 [${i+1}/${candidates.length}]: ${item.innerText.slice(0, 15)}...`;
            await new Promise(r => setTimeout(r, 2000)); // 等待 2 秒让网络请求发出
        }

        isAutoScanning = false;
        if (statusEl) statusEl.innerText = `巡检完成！累计捕获 ${store.videos.size} 个视频。`;
    }

    // 6. 导出 JSON
    function exportJSON() {
        const list = Array.from(store.videos.values());
        if (list.length === 0) {
            alert("当前尚未捕获到视频资源！请点击课程列表中的任意视频播放，或使用【自动轮巡检测】。");
            return;
        }
        const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `course_videos_${Date.now()}.json`;
        a.click();
    }

    // 7. 渲染前端悬浮控制条
    function createUI() {
        if (document.getElementById('sniffer-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'sniffer-panel';
        panel.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                <span>🎯 课程视频智能嗅探器</span>
                <span id="sniffer-count" style="background: #2563eb; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 12px;">0 部</span>
            </div>
            <div id="sniffer-status" style="font-size: 12px; color: #64748b; margin-bottom: 10px; max-height: 40px; overflow: hidden;">准备就绪，正在监听网络与播放器...</div>
            <div style="display: flex; gap: 8px;">
                <button id="btn-auto-scan" style="flex: 1; padding: 6px 10px; background: #0284c7; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">⚡ 自动巡检课时</button>
                <button id="btn-export-json" style="flex: 1; padding: 6px 10px; background: #10b981; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">📥 导出 JSON</button>
            </div>
        `;
        Object.assign(panel.style, {
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '280px',
            background: '#ffffff',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '14px',
            zIndex: '99999999',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: '#1e293b'
        });
        document.body.appendChild(panel);

        document.getElementById('btn-auto-scan').addEventListener('click', () => {
            if (isAutoScanning) {
                isAutoScanning = false;
                document.getElementById('btn-auto-scan').innerText = "⚡ 自动巡检课时";
            } else {
                document.getElementById('btn-auto-scan').innerText = "⏹ 停止巡检";
                startAutoScan();
            }
        });

        document.getElementById('btn-export-json').addEventListener('click', exportJSON);
    }

    function updateUI() {
        const countEl = document.getElementById('sniffer-count');
        const statusEl = document.getElementById('sniffer-status');
        if (countEl) countEl.innerText = `${store.videos.size} 部`;
        if (statusEl && !isAutoScanning) {
            statusEl.innerText = `已捕获 ${store.videos.size} 个视频链接，可随时导出！`;
        }
    }

    createUI();
})();
