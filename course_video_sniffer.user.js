// ==UserScript==
// @name         智越教育课程全目录静默嗅探与批量提取器(V3.1 静默进度版)
// @namespace    https://antigravity.deepmind/
// @version      3.1.0
// @description  纯后台静默嗅探：不点击页面、页面完全静止、实时进度条展示、无任何emoji字符，直接从内存与API批量提取视频流并导出JSON
// @author       Antigravity
// @match        *://*.gspxonline.com/*
// @match        http://jsgs.study.gspxonline.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    console.log("[视频嗅探器 V3.1] 初始化完成，后台静默监听中...");

    window.__SNIFFER_DATA__ = window.__SNIFFER_DATA__ || {
        videos: new Map(),
        rawCatalog: null
    };
    const store = window.__SNIFFER_DATA__;

    function recordVideo(url, title, extra = {}) {
        if (!url || typeof url !== 'string' || url.startsWith('blob:')) return;
        const isMedia = url.includes('.mp4') || url.includes('.m3u8') || url.includes('.flv') || url.includes('/play');
        if (!isMedia) return;

        const cleanTitle = (title || '未命名课时').replace(/[\\/:*?"<>|\r\n\t]/g, "_").trim();
        if (!store.videos.has(url)) {
            store.videos.set(url, {
                id: store.videos.size + 1,
                title: cleanTitle,
                url: url,
                type: url.includes('.m3u8') ? 'm3u8' : 'mp4',
                ...extra
            });
            console.log(`[捕获视频 #${store.videos.size}] ${cleanTitle} => ${url}`);
            updateUI();
        }
    }

    // 1. 静默拦截 XHR 与 Fetch
    const rawXHR = window.XMLHttpRequest.prototype.open;
    const rawSend = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.open = function (m, url) { this._url = url; return rawXHR.apply(this, arguments); };
    window.XMLHttpRequest.prototype.send = function () {
        this.addEventListener('load', function () {
            try { handleNetworkTraffic(this._url, this.responseText); } catch (e) {}
        });
        return rawSend.apply(this, arguments);
    };

    const rawFetch = window.fetch;
    window.fetch = async function (...args) {
        const res = await rawFetch.apply(this, args);
        try {
            const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
            const clone = res.clone();
            clone.text().then(text => handleNetworkTraffic(url, text)).catch(() => {});
        } catch (e) {}
        return res;
    };

    function handleNetworkTraffic(url, text) {
        if (!text) return;
        if (url && (url.includes('.mp4') || url.includes('.m3u8'))) {
            recordVideo(url, '在线视频流');
        }
        try {
            const json = JSON.parse(text);
            const str = JSON.stringify(json);
            if (!store.rawCatalog && (str.includes('chapter') || str.includes('section') || str.includes('courseware') || str.includes('catalog'))) {
                store.rawCatalog = json;
            }
            recursiveExtractVideos(json);
        } catch (e) {}
    }

    function recursiveExtractVideos(obj, parentTitle = '') {
        if (!obj || typeof obj !== 'object') return;
        const currentTitle = obj.name || obj.title || obj.sectionName || obj.coursewareName || parentTitle;
        const url = obj.url || obj.playUrl || obj.videoUrl || obj.m3u8Url || obj.video_url || obj.streamUrl;
        if (typeof url === 'string' && (url.includes('.mp4') || url.includes('.m3u8'))) {
            recordVideo(url, currentTitle);
        }
        for (const k in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, k)) recursiveExtractVideos(obj[k], currentTitle);
        }
    }

    function scanVueTreeSilently() {
        const foundLessons = [];
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
            const v = el.__vue__;
            if (!v) continue;
            const targets = [v.$data, v.$props, v._data, v];
            for (const t of targets) {
                if (!t) continue;
                for (const key of Object.keys(t)) {
                    const val = t[key];
                    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
                        const s = JSON.stringify(val[0]);
                        if (s.includes('name') || s.includes('title') || s.includes('chapter') || s.includes('section') || s.includes('courseware')) {
                            flattenTree(val, foundLessons);
                        }
                    }
                }
            }
        }
        return foundLessons;
    }

    function flattenTree(items, result = []) {
        if (!Array.isArray(items)) return;
        for (const item of items) {
            if (!item || typeof item !== 'object') continue;
            const title = item.name || item.title || item.sectionName || item.coursewareName;
            const url = item.url || item.playUrl || item.videoUrl || item.m3u8Url;
            const id = item.id || item.sectionId || item.coursewareId || item.resourceId;
            if (url && (url.includes('.mp4') || url.includes('.m3u8'))) {
                recordVideo(url, title);
            } else if (id && title) {
                result.push({ id, title, raw: item });
            }
            const children = item.children || item.sectionList || item.coursewareList || item.subList || item.list;
            if (Array.isArray(children)) flattenTree(children, result);
        }
    }

    // 更新进度条显示
    function setProgress(current, total, msg = '') {
        const bar = document.getElementById('sniffer-progress-fill');
        const textCurrent = document.getElementById('sniffer-progress-cur');
        const textPercent = document.getElementById('sniffer-progress-pct');
        const statusEl = document.getElementById('sniffer-status');

        const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
        if (bar) bar.style.width = `${pct}%`;
        if (textPercent) textPercent.innerText = `${pct}%`;
        if (textCurrent) textCurrent.innerText = `${current}/${total}`;
        if (statusEl && msg) statusEl.innerText = msg;
    }

    // 纯后台静默拉取直链 (页面无任何视觉变化)
    async function executeSilentScan() {
        setProgress(0, 100, "正在从页面底层内存读取全目录...");

        const lessons = scanVueTreeSilently();
        if (store.rawCatalog) recursiveExtractVideos(store.rawCatalog);

        if (store.videos.size > 1) {
            setProgress(100, 100, `静默分析完成，已捕获 ${store.videos.size} 个视频流`);
            return;
        }

        if (lessons.length > 0) {
            const total = lessons.length;
            setProgress(0, total, `检测到 ${total} 个课时节点，开始后台拉取...`);

            let successCount = 0;
            for (let i = 0; i < total; i++) {
                const item = lessons[i];
                try {
                    const testUrls = [
                        `/resource/api/course/getPlayUrl?id=${item.id}`,
                        `/study/api/getPlayUrl?id=${item.id}&courseId=991`,
                        `/api/courseware/play/${item.id}`,
                        `/study/course/getPlayInfo?coursewareId=${item.id}`
                    ];
                    for (const testUrl of testUrls) {
                        const resp = await fetch(testUrl, { credentials: 'include' });
                        if (resp.ok) {
                            const data = await resp.json();
                            recursiveExtractVideos(data, item.title);
                            if (store.videos.size > successCount) {
                                successCount = store.videos.size;
                                break;
                            }
                        }
                    }
                } catch (e) {}

                setProgress(i + 1, total, `后台提取中: ${item.title.slice(0, 12)}... (已捕获 ${store.videos.size} 部)`);
                await new Promise(r => setTimeout(r, 150));
            }
            setProgress(total, total, `后台提取完毕，共捕获 ${store.videos.size} 部视频`);
        } else {
            setProgress(0, 0, "未在内存中发现目录树，请点击[导出诊断数据]");
        }
    }

    function exportJSON() {
        const list = Array.from(store.videos.values());
        if (list.length === 0) {
            alert("暂未捕获到视频，请点击[静默提取]");
            return;
        }
        const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `course_videos.json`;
        a.click();
    }

    function exportDebugData() {
        const debugData = {
            capturedVideos: Array.from(store.videos.values()),
            rawCatalog: store.rawCatalog,
            url: window.location.href,
            title: document.title
        };
        const blob = new Blob([JSON.stringify(debugData, null, 2)], { type: "application/json;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `course_debug_data.json`;
        a.click();
    }

    function createUI() {
        if (document.getElementById('sniffer-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'sniffer-panel';
        panel.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 13px;">课程视频静默嗅探器</span>
                <span id="sniffer-count" style="background: #2563eb; color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 11px;">0 部</span>
            </div>
            <div id="sniffer-status" style="font-size: 11px; color: #64748b; margin-bottom: 6px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">页面保持静止，后台运行</div>
            
            <!-- 进度条模块 -->
            <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-bottom: 4px;">
                <div id="sniffer-progress-fill" style="width: 0%; height: 100%; background: #2563eb; transition: width 0.2s ease;"></div>
            </div>
            <div style="font-size: 11px; color: #64748b; display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span id="sniffer-progress-pct">0%</span>
                <span id="sniffer-progress-cur">0/0</span>
            </div>

            <div style="display: flex; gap: 6px;">
                <button id="btn-silent-fetch" style="flex: 1; padding: 6px; background: #0284c7; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">静默提取</button>
                <button id="btn-export-json" style="flex: 1; padding: 6px; background: #059669; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">导出 JSON</button>
            </div>
            <div style="margin-top: 6px; text-align: right;">
                <a id="btn-export-debug" href="javascript:void(0)" style="font-size: 11px; color: #94a3b8; text-decoration: underline;">导出诊断数据</a>
            </div>
        `;
        Object.assign(panel.style, {
            position: 'fixed', bottom: '20px', right: '20px', width: '270px',
            background: '#ffffff', boxShadow: '0 8px 20px -4px rgba(0,0,0,0.18)',
            border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px',
            zIndex: '99999999', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: '#1e293b'
        });
        document.body.appendChild(panel);

        document.getElementById('btn-silent-fetch').addEventListener('click', executeSilentScan);
        document.getElementById('btn-export-json').addEventListener('click', exportJSON);
        document.getElementById('btn-export-debug').addEventListener('click', exportDebugData);
    }

    function updateUI() {
        const countEl = document.getElementById('sniffer-count');
        const statusEl = document.getElementById('sniffer-status');
        if (countEl) countEl.innerText = `${store.videos.size} 部`;
        if (statusEl && (!statusEl.innerText.includes('后台提取中') && !statusEl.innerText.includes('检测到'))) {
            statusEl.innerText = `已捕获 ${store.videos.size} 个视频流`;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createUI);
    } else {
        createUI();
    }
})();
