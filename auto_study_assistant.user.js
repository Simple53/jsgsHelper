// ==UserScript==
// @name         江苏高校岗培 - 学习播放助手(V5.0)
// @namespace    https://github.com/Simple53/jsgsHelper
// @version      5.0.2
// @description  五门课程默认连播、文件翻页、进度刷新与紧凑悬浮控制面板；支持不同账号使用
// @author       Simple53
// @match        *://jsgs.study.gspxonline.com/*
// @match        *://*.gspxonline.com/*
// @updateURL    https://raw.githubusercontent.com/Simple53/jsgsHelper/main/auto_study_assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/Simple53/jsgsHelper/main/auto_study_assistant.user.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    console.log("[jsgsHelper V5.0] 学习助手已加载...");

    // =========================================================================
    // 0. 主页面上下文核心注入：从底层彻底阻断切屏暂停 + 多窗口冲突
    // =========================================================================
    (function() {
        console.log("[jsgsHelper 内核] 正在安装防切屏拦截器、多窗口隔离层与媒体控制增强...");

        window._masterEnabled = localStorage.getItem('gspx_master_enabled') !== 'false';
        window._targetSpeed = parseFloat(localStorage.getItem('gspx_custom_speed') || '1.0');
        var refreshState = null;
        try { refreshState = JSON.parse(sessionStorage.getItem('gspx_refresh_resume')); } catch (_) {}
        window._allowUserPause = !window._masterEnabled || !!(refreshState && refreshState.manualPause &&
            Date.now() - refreshState.at < 30000);
        window._isSeeking = false;
        window._tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

        // =============================================================
        // 核心突破 1：全局拔除切屏/失焦/跨标签通信监听器的注册权限
        // =============================================================
        var origAddEventListener = EventTarget.prototype.addEventListener;
        var BLOCKED_DOC_WIN_EVENTS = {
            'visibilitychange': true, 'webkitvisibilitychange': true,
            'blur': true, 'focusout': true, 'focusin': true,
            'pagehide': true, 'pageshow': true,
            'freeze': true, 'resume': true
        };

        EventTarget.prototype.addEventListener = function(type, listener, options) {
            if (BLOCKED_DOC_WIN_EVENTS[type] && (this === window || this === document || this === document.documentElement)) {
                console.log("[jsgsHelper] 拦截并丢弃 " + type + " 监听器注册");
                return;
            }
            if (type === 'storage' && this === window) {
                console.log("[jsgsHelper] 拦截 storage 事件监听 (多窗口隔离)");
                return;
            }
            if (type === 'ratechange' && listener && window._masterEnabled) {
                var fnStr = listener.toString();
                if (fnStr.includes('playbackRate=1') || fnStr.includes('playbackRate = 1') || fnStr.includes('1!==') || fnStr.includes('1 !==')) {
                    console.log("[jsgsHelper] 拔除平台 lockPlaybackRate 监听器");
                    return;
                }
            }
            return origAddEventListener.apply(this, arguments);
        };

        // =============================================================
        // 核心突破 2：捕获阶段事件阻断 (双保险)
        // 即使有监听器在拦截前已注册，也在捕获阶段彻底阻止事件传播
        // =============================================================
        ['visibilitychange', 'webkitvisibilitychange'].forEach(function(evt) {
            origAddEventListener.call(document, evt, function(e) {
                e.stopImmediatePropagation(); e.preventDefault(); e.stopPropagation();
            }, true);
            origAddEventListener.call(window, evt, function(e) {
                e.stopImmediatePropagation(); e.preventDefault(); e.stopPropagation();
            }, true);
        });
        ['blur', 'focusout', 'pagehide'].forEach(function(evt) {
            origAddEventListener.call(window, evt, function(e) {
                e.stopImmediatePropagation(); e.stopPropagation();
            }, true);
            origAddEventListener.call(document, evt, function(e) {
                e.stopImmediatePropagation(); e.stopPropagation();
            }, true);
        });

        // =============================================================
        // 核心突破 3：完全覆写可见性与焦点状态 + 属性 setter 拦截
        // =============================================================
        try {
            Object.defineProperty(Document.prototype, 'hidden', { get: function() { return false; }, configurable: true });
            Object.defineProperty(document, 'hidden', { get: function() { return false; }, configurable: true });
            Object.defineProperty(Document.prototype, 'visibilityState', { get: function() { return 'visible'; }, configurable: true });
            Object.defineProperty(document, 'visibilityState', { get: function() { return 'visible'; }, configurable: true });
            Object.defineProperty(Document.prototype, 'webkitHidden', { get: function() { return false; }, configurable: true });
            Object.defineProperty(Document.prototype, 'webkitVisibilityState', { get: function() { return 'visible'; }, configurable: true });
            Document.prototype.hasFocus = function() { return true; };
            document.hasFocus = function() { return true; };

            // 阻止通过属性赋值设置失焦/可见性回调
            Object.defineProperty(document, 'onvisibilitychange', { get: function() { return null; }, set: function() {}, configurable: true });
            Object.defineProperty(window, 'onblur', { get: function() { return null; }, set: function() {}, configurable: true });
            Object.defineProperty(window, 'onfocus', { get: function() { return null; }, set: function() {}, configurable: true });
            Object.defineProperty(document, 'onblur', { get: function() { return null; }, set: function() {}, configurable: true });
            Object.defineProperty(document, 'onfocus', { get: function() { return null; }, set: function() {}, configurable: true });
        } catch(e) {}

        // =============================================================
        // 核心突破 5：拦截意外 pause 调用 (仅在未到结尾时拦截外部暂停)
        // =============================================================
        var origPause = HTMLMediaElement.prototype.pause;
        HTMLMediaElement.prototype.pause = function() {
            if (!window._masterEnabled || window._allowUserPause || window._isSeeking) {
                return origPause.apply(this, arguments);
            }
            if (this.duration && this.currentTime < this.duration - 0.8) {
                // 仅拦截非播放结束时的外部暂停 (例如窗口切走或失去焦点时的 pause)
                console.log("[jsgsHelper] 拦截切屏/失焦引起的 pause 调用，保持播放状态");
                return;
            }
            return origPause.apply(this, arguments);
        };

        // =============================================================
        // 核心突破 6：劫持 playbackRate Setter
        // =============================================================
        var origDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
        if (origDesc) {
            Object.defineProperty(HTMLMediaElement.prototype, 'playbackRate', {
                get: function() { return origDesc.get.call(this); },
                set: function(val) {
                    if (window._masterEnabled && val === 1 && window._targetSpeed && window._targetSpeed !== 1 && !window._userExplicitSpeed1) {
                        return origDesc.set.call(this, window._targetSpeed);
                    }
                    return origDesc.set.call(this, val);
                },
                configurable: true
            });
        }

        // =============================================================
        // 核心突破 7：BroadcastChannel 隔离 (多窗口并行学习)
        // 每个标签页分配独立通道名，阻止跨标签页通信互踢
        // =============================================================
        if (window.BroadcastChannel) {
            var OrigBC = window.BroadcastChannel;
            window.BroadcastChannel = function(name) {
                var isolatedName = name + '__jsgs_isolated__' + window._tabId;
                console.log("[jsgsHelper] BroadcastChannel 隔离: " + name + " -> 独立通道");
                return new OrigBC(isolatedName);
            };
            window.BroadcastChannel.prototype = OrigBC.prototype;
        }

        // =============================================================
        // 核心突破 8：会话冲突响应拦截 (多窗口并行学习)
        // =============================================================

        // 8a: XHR 响应拦截 (安全改写 response，不干扰进度上报)
        var origXHROpen = XMLHttpRequest.prototype.open;
        var origXHRSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url) {
            this._jsgsUrl = (typeof url === 'string') ? url : '';
            return origXHROpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function() {
            var xhr = this;
            var url = xhr._jsgsUrl || '';

            if (url.includes('study') || url.includes('session') || url.includes('heartbeat') ||
                url.includes('learn') || url.includes('keepalive') || url.includes('record') ||
                url.includes('check') || url.includes('status')) {

                origAddEventListener.call(xhr, 'readystatechange', function() {
                    if (xhr.readyState === 4 && xhr.status === 200) {
                        try {
                            var text = xhr.responseText;
                            if (text && (text.includes('kick') || text.includes('conflict') ||
                                text.includes('otherSession') || text.includes('forceStop') ||
                                text.includes('duplicate'))) {
                                var json = JSON.parse(text);
                                var modified = false;
                                var conflictKeys = ['kick', 'kickOut', 'conflict', 'forceStop',
                                    'otherSession', 'isConflict', 'needStop', 'offline',
                                    'duplicate', 'isKick', 'forceOffline', 'isOther'];
                                function patchObj(obj) {
                                    if (!obj || typeof obj !== 'object') return;
                                    conflictKeys.forEach(function(key) {
                                        if (obj.hasOwnProperty(key) && obj[key]) {
                                            obj[key] = false;
                                            modified = true;
                                        }
                                    });
                                }
                                patchObj(json);
                                patchObj(json.data);
                                patchObj(json.result);
                                if (modified) {
                                    var newText = JSON.stringify(json);
                                    try {
                                        Object.defineProperty(xhr, 'responseText', { get: function() { return newText; }, configurable: true });
                                        Object.defineProperty(xhr, 'response', { get: function() { return newText; }, configurable: true });
                                    } catch(e) {}
                                    console.log("[jsgsHelper] 已中和会话冲突踢出响应");
                                }
                            }
                        } catch(e) {}
                    }
                });
            }

            return origXHRSend.apply(this, arguments);
        };

        // 8b: WebSocket 消息拦截
        if (window.WebSocket) {
            var OrigWSProto = window.WebSocket.prototype;
            var origOnMsgDesc = Object.getOwnPropertyDescriptor(OrigWSProto, 'onmessage');

            if (origOnMsgDesc && origOnMsgDesc.set) {
                Object.defineProperty(OrigWSProto, 'onmessage', {
                    get: function() { return this._jsgsOnMsg || null; },
                    set: function(fn) {
                        var ws = this;
                        this._jsgsOnMsg = function(event) {
                            try {
                                var data = typeof event.data === 'string' ? event.data : '';
                                if (data.includes('kick') || data.includes('conflict') ||
                                    data.includes('forceStop') || data.includes('duplicate')) {
                                    console.log("[jsgsHelper] 拦截 WebSocket 踢出消息");
                                    return;
                                }
                            } catch(e) {}
                            if (fn) fn.call(ws, event);
                        };
                        if (origOnMsgDesc.set) origOnMsgDesc.set.call(ws, ws._jsgsOnMsg);
                    },
                    configurable: true
                });
            }

            var origWSAddEvent = OrigWSProto.addEventListener;
            if (origWSAddEvent) {
                OrigWSProto.addEventListener = function(type, listener, options) {
                    if (type === 'message' && listener) {
                        var origListener = listener;
                        var wrappedListener = function(event) {
                            try {
                                var data = typeof event.data === 'string' ? event.data : '';
                                if (data.includes('kick') || data.includes('conflict') ||
                                    data.includes('forceStop') || data.includes('duplicate')) {
                                    console.log("[jsgsHelper] 拦截 WebSocket(addEventListener) 踢出消息");
                                    return;
                                }
                            } catch(e) {}
                            origListener.call(this, event);
                        };
                        return origWSAddEvent.call(this, type, wrappedListener, options);
                    }
                    return origWSAddEvent.apply(this, arguments);
                };
            }
        }

        // =============================================================
        // 核心突破 9：解锁进度条拖动 + 中和 Vue 会话停止方法
        // =============================================================
        function unlockSeekAndNeutralizeConflict() {
            function findVue(node) {
                if (!node) return null;
                if (node.__vue__) return node.__vue__;
                for (var i = 0; i < node.children.length; i++) {
                    var v = findVue(node.children[i]);
                    if (v) return v;
                }
                return null;
            }
            var root = findVue(document.body);
            if (!root) return;

            function walk(v) {
                if (!v) return;

                // 解锁进度条
                if (v.canUserSeek && (v.info?.isFast !== true || !v._seekUnlocked)) {
                    v._seekUnlocked = true;
                    v.canUserSeek = function() { return true; };
                    v.maxAllowedSeekSec = function() { return 999999; };
                    if (v.info) v.info.isFast = true;
                    if (v.applySeekPolicy) v.applySeekPolicy();
                }
                if (v.videoPlayer && v.videoPlayer.setSeekPolicy) {
                    v.videoPlayer.setSeekPolicy({ allowUserSeek: true, maxSec: 999999 });
                }

                // 保护会话切屏监听 (防止失焦掐断心跳，但允许正常心跳发送)
                if (v._onStudyVis && !v._jsgsVisPatched) {
                    v._jsgsVisPatched = true;
                    v._onStudyVis = function() {
                        console.log("[jsgsHelper] 拦截 _onStudyVis 切屏暂停触发");
                    };
                }
                if (v.kickOut && !v._jsgsKickPatched) {
                    v._jsgsKickPatched = true;
                    v.kickOut = function() {
                        console.log("[jsgsHelper] 拦截 kickOut (多窗口保护)");
                    };
                }
                if (v.forceOffline && !v._jsgsOfflinePatched) {
                    v._jsgsOfflinePatched = true;
                    v.forceOffline = function() {
                        console.log("[jsgsHelper] 拦截 forceOffline (多窗口保护)");
                    };
                }
                if (v.handleConflict && !v._jsgsConflictPatched) {
                    v._jsgsConflictPatched = true;
                    v.handleConflict = function() {
                        console.log("[jsgsHelper] 拦截 handleConflict (多窗口保护)");
                    };
                }

                if (v.$children) v.$children.forEach(walk);
            }
            walk(root);
        }

        // =============================================================
        // 核心突破 10：高频心跳守护定时器
        // =============================================================
        var watchedVideo = null;
        var lastVideoTime = 0;
        var lastAdvanceAt = Date.now();
        setInterval(function() {
            var v = document.querySelector('video');
            if (!v) return;

            if (!v._seekBound) {
                v._seekBound = true;
                origAddEventListener.call(v, 'seeking', function() { window._isSeeking = true; });
                origAddEventListener.call(v, 'seeked', function() { setTimeout(function() { window._isSeeking = false; }, 350); });
                // 平台通过已缓存的原生 pause 方法暂停时，原型拦截不会执行；媒体事件可补上这一条路径。
                origAddEventListener.call(v, 'pause', function() {
                    if (window._masterEnabled && !window._allowUserPause && !window._isSeeking && !v.ended) {
                        Promise.resolve().then(function() { window._studyAssistantPlay?.(v); });
                    }
                });
                ['loadedmetadata', 'canplay'].forEach(function(type) {
                    origAddEventListener.call(v, type, function() { window._studyAssistantPlay?.(v); });
                });
            }

            unlockSeekAndNeutralizeConflict();

            if (!window._masterEnabled) return;

            // 后台可能出现 paused=false、但时间轴已停止的假播放状态。
            if (v !== watchedVideo || Math.abs(v.currentTime - lastVideoTime) > 0.25) {
                watchedVideo = v;
                lastVideoTime = v.currentTime;
                lastAdvanceAt = Date.now();
            } else if (!v.paused && !v.ended && !window._allowUserPause && !window._isSeeking &&
                v.readyState >= 2 && v.currentTime < (v.duration || Infinity) - 0.8 &&
                Date.now() - lastAdvanceAt > 15000) {
                lastAdvanceAt = Date.now();
                origPause.call(v);
                window._studyAssistantPlay?.(v);
            }

            if (window._targetSpeed && Math.abs(v.playbackRate - window._targetSpeed) > 0.05) {
                if (origDesc && origDesc.set) origDesc.set.call(v, window._targetSpeed);
                else v.playbackRate = window._targetSpeed;
            }

            if (v.paused && !v.ended && v.currentTime < (v.duration || 999999) - 0.8 && !window._allowUserPause && !window._isSeeking) {
                window._studyAssistantPlay?.(v);
            }
        }, 300);

        // 定期重新断言属性覆写 (防止平台动态重置)
        setInterval(function() {
            try {
                Object.defineProperty(document, 'hidden', { get: function() { return false; }, configurable: true });
                Object.defineProperty(document, 'visibilityState', { get: function() { return 'visible'; }, configurable: true });
                document.hasFocus = function() { return true; };
            } catch(e) {}
        }, 2000);

        window._studyAssistantReady = true;
        console.log("[jsgsHelper 内核] 播放监听已安装，TabID: " + window._tabId);
    })();

    // =========================================================================
    // 1. 默认课程队列；用户可在当前标签会话覆盖，不读取或保存账号凭据
    // =========================================================================
    const courseQueueKey = 'gspx_course_queue_v5';
    const DEFAULT_COURSES = [
        { id: '991', name: '高等教育学' },
        { id: '1088', name: '高等教育心理学' },
        { id: '1072', name: '高等教育政策与法律' },
        { id: '993', name: '高校教师职业道德规范' },
        { id: '994', name: '习近平总书记教育重要论述' }
    ];
    function parseCourseQueue(value) {
        const ids = String(value || '').split(/[，,\s]+/).filter(Boolean);
        return ids.length <= 30 && ids.every(id => /^\d{1,10}$/.test(id))
            ? [...new Set(ids)].map(id => DEFAULT_COURSES.find(course => course.id === id) || { id, name: `课程 ${id}` }) : null;
    }
    const storedQueue = sessionStorage.getItem(courseQueueKey);
    let COURSE_QUEUE = storedQueue === null ? DEFAULT_COURSES : (parseCourseQueue(storedQueue) || DEFAULT_COURSES);

    const storedRefresh = localStorage.getItem('gspx_refresh_minutes');
    const config = {
        enabled: localStorage.getItem('gspx_master_enabled') !== 'false',
        compensateMode: localStorage.getItem('gspx_compensate_mode') || 'stay_end',
        speed: parseFloat(localStorage.getItem('gspx_custom_speed') || '1.0'),
        autoNext: localStorage.getItem('gspx_auto_next') !== 'false',
        crossCourse: localStorage.getItem('gspx_cross_course') !== 'false',
        autoMute: localStorage.getItem('gspx_auto_mute') !== 'false',
        refreshMinutes: storedRefresh !== null && /^\d+$/.test(storedRefresh) && Number(storedRefresh) <= 120
            ? Number(storedRefresh) : 5,
        autoDismiss: true
    };

    let checkTimer = null;
    let isNavigating = false;
    let listStartTimer = null;
    let lastRefreshAt = Date.now();
    let documentPageKey = '';
    let documentPageSince = 0;
    let documentLastClick = 0;
    let documentFinished = false;
    const refreshResumeKey = 'gspx_refresh_resume';

    function getCurrentCourseId() {
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        const match = hash.match(/\/learn\/(\d+)/) || search.match(/courseId=(\d+)/) || search.match(/\/course\/(\d+)/);
        return match ? match[1] : null;
    }

    function restorePlaybackPosition(video) {
        if (video._studyPositionChecked || video.readyState < 1 || !Number.isFinite(video.duration) || video.duration <= 0) return;
        video._studyPositionChecked = true;
        try {
            const saved = JSON.parse(sessionStorage.getItem(refreshResumeKey));
            sessionStorage.removeItem(refreshResumeKey);
            if (saved && saved.courseId === getCurrentCourseId() && Date.now() - saved.at < 30000 &&
                Number.isFinite(saved.time) && saved.time > video.currentTime + 3 && saved.time < video.duration - 5) {
                video.currentTime = saved.time;
            }
        } catch (_) {}
    }

    window._studyAssistantPlay = function(video) {
        if (!config.enabled || window._allowUserPause || window._isSeeking || video.ended || !video.paused ||
            video._studyPlayPending || Date.now() < (video._studyRetryAfter || 0)) return;
        if (config.autoMute) video.muted = true;
        if (video.readyState < 2) return;
        restorePlaybackPosition(video);
        video._studyPlayPending = true;
        try {
            Promise.resolve(video.play()).catch(() => {
                video._studyRetryAfter = Date.now() + 1500;
                showStatus('自动播放受阻，请点击视频或面板中的继续播放');
            }).finally(() => { video._studyPlayPending = false; });
        } catch (_) {
            video._studyPlayPending = false;
            video._studyRetryAfter = Date.now() + 1500;
        }
    };

    function refreshProgressPage(video) {
        try {
            if (video && Number.isFinite(video.currentTime)) {
                sessionStorage.setItem(refreshResumeKey, JSON.stringify({
                    courseId: getCurrentCourseId(), time: video.currentTime,
                    at: Date.now(), manualPause: window._allowUserPause
                }));
            } else {
                sessionStorage.removeItem(refreshResumeKey);
            }
        } catch (_) {}
        lastRefreshAt = Date.now();
        showStatus('正在刷新页面，同步平台进度…');
        window.location.reload();
    }

    function maybeRefreshProgress(video, videoPercent) {
        if (!config.refreshMinutes || isNavigating || window._allowUserPause || video.paused || video.ended ||
            videoPercent >= 98 || Date.now() - lastRefreshAt < config.refreshMinutes * 60000) return;
        refreshProgressPage(video);
    }

    // =========================================================================
    // 2. 主循环调度
    // =========================================================================
    function mainLoop() {
        if (!config.enabled) {
            updateUI(null, null);
            showStatus("插件已暂停接管，所有控制已恢复原生");
            return;
        }

        if (config.autoDismiss) dismissDialogs();

        const curHash = window.location.hash || '';

        if (!document.querySelector('video') && (curHash.includes('/study/list') || curHash === '#/study' || curHash === '')) {
            handleCourseListPage();
            return;
        }

        if (!document.querySelector('video') && handleDocumentPage()) return;

        handleLearnPage();
    }

    function getDocumentPage() {
        const inReaderHeader = el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.left < window.innerWidth * 0.5 && rect.top < window.innerHeight * 0.35;
        };
        for (const input of document.querySelectorAll('input')) {
            if (!inReaderHeader(input)) continue;
            const current = Number(input.value);
            const text = input.parentElement?.parentElement?.innerText || input.parentElement?.innerText || '';
            const total = Number(text.match(/\/\s*(\d+)/)?.[1]);
            if (current >= 1 && total >= current && total <= 1000) return { current, total };
        }
        for (const el of document.querySelectorAll('span, div')) {
            if (!inReaderHeader(el) || el.children.length > 2) continue;
            const match = (el.innerText || '').trim().match(/^(\d+)\s*\/\s*(\d+)$/);
            if (match && Number(match[1]) >= 1 && Number(match[2]) >= Number(match[1])) {
                return { current: Number(match[1]), total: Number(match[2]) };
            }
        }
        return null;
    }

    function getDocumentNextButton() {
        return Array.from(document.querySelectorAll('button, [role="button"], [title], [aria-label], [class]')).find(el => {
            if (el.closest('#study-assistant-hud')) return false;
            const rect = el.getBoundingClientRect();
            if (rect.width < 12 || rect.width > 90 || rect.height < 12 || rect.height > 90 ||
                rect.left < window.innerWidth * 0.4 || rect.right > window.innerWidth * 0.75 ||
                rect.top < window.innerHeight * 0.25 || rect.top > window.innerHeight * 0.8) return false;
            const label = ['title', 'aria-label', 'class'].map(name => el.getAttribute(name) || '').join(' ');
            return /下一页|next|arrow.?right|chevron.?right|right.?arrow|icon-right|btn-right/i.test(label) ||
                /^[→›]$/.test((el.textContent || '').trim());
        });
    }

    function handleDocumentPage() {
        const page = getDocumentPage();
        if (!page) return false;
        const items = getLessonItems();
        const active = items.find(isActiveLesson);
        const key = `${active?.innerText || ''}:${page.current}/${page.total}`;
        if (key !== documentPageKey) {
            documentPageKey = key;
            documentPageSince = Date.now();
            documentLastClick = 0;
        }
        updateUI(page.current / page.total * 100, getCurrentLessonPlatformProgress(), '文件');
        if (!config.autoNext || isNavigating || Date.now() - documentPageSince < 8000 ||
            Date.now() - documentLastClick < 8000) return true;

        if (page.current < page.total) {
            const next = getDocumentNextButton();
            if (!next) {
                showStatus('未识别文件下一页按钮，请手动翻页');
                return true;
            }
            documentLastClick = Date.now();
            next.click();
            showStatus(`文件阅读：正在翻至第 ${page.current + 1}/${page.total} 页`);
            return true;
        }

        if (!items.length) {
            showStatus('文件已到末页，等待平台记录进度');
            return true;
        }
        if (isAllLessonsFinished(items)) {
            if (!documentFinished) {
                documentFinished = true;
                isNavigating = true;
                handleCrossCourseNext();
            }
            return true;
        }
        const activeIndex = items.indexOf(active);
        const incomplete = el => parseFloat((el.innerText || '').match(/(\d+(?:\.\d+)?)\s*%/)?.[1] || '0') < 100;
        const next = items.slice(activeIndex + 1).find(incomplete) || items.find(incomplete);
        if (next && next !== active) {
            documentLastClick = Date.now();
            next.scrollIntoView({ block: 'center' });
            next.click();
            showStatus('文件已翻到末页，正在打开下一份未完成文件');
        } else {
            showStatus('文件已到末页，等待平台记录进度');
        }
        return true;
    }

    function handleCourseListPage() {
        if (!COURSE_QUEUE.length) {
            showStatus('请打开已报名课程，或在面板配置跨课顺序');
            return;
        }
        if (listStartTimer) return;
        const startHash = window.location.hash || '';
        showStatus(`课程大厅：3 秒后进入《${COURSE_QUEUE[0].name}》`);
        listStartTimer = setTimeout(() => {
            listStartTimer = null;
            if (!config.enabled || document.querySelector('video') || (window.location.hash || '') !== startHash) return;
            const id = COURSE_QUEUE[0].id;
            window.location.href = `https://jsgs.study.gspxonline.com/resource/index?route=/study/course/${id}#/study/learn/${id}`;
        }, 3000);
    }

    function handleLearnPage() {
        const video = document.querySelector('video');
        if (!video) {
            showStatus('等待课程视频加载…');
            return;
        }

        restorePlaybackPosition(video);
        if (!isNavigating) window._studyAssistantPlay(video);
        const playbackLabel = document.getElementById('hud-playback-label');
        if (playbackLabel) playbackLabel.textContent = video.paused ? '继续播放' : '暂停视频';
        if (window._allowUserPause) showStatus('已手动暂停');
        else if (!video.paused) showStatus('视频播放中 · 切换窗口后会尝试保持播放');

        const duration = video.duration || 0;
        const curTime = video.currentTime || 0;
        const videoPercent = duration > 0 ? (curTime / duration) * 100 : 0;
        const platformProgress = getCurrentLessonPlatformProgress();

        updateUI(videoPercent, platformProgress);

        if ((videoPercent >= 99.0 || video.ended) && config.autoNext && !isNavigating) {
            isNavigating = true;
            handleLessonEnding(video, platformProgress);
            return;
        }
        maybeRefreshProgress(video, videoPercent);
    }

    function getCurrentLessonPlatformProgress() {
        const activeItem = getActiveLessonElement();
        if (!activeItem) return null;
        const text = activeItem.innerText || '';
        const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
        return m ? parseFloat(m[1]) : (text.includes('100%') ? 100 : null);
    }

    function getLessonItems() {
        const isProgressItem = el => el.offsetHeight > 0 &&
            !el.closest('#study-assistant-hud') && /\d+(?:\.\d+)?\s*%/.test(el.innerText || '');
        // 优先使用列表项作为课时行，避免把课时内部的进度文字重复算作下一节。
        const listItems = Array.from(document.querySelectorAll('li')).filter(isProgressItem)
            .filter(el => !Array.from(el.querySelectorAll('li')).some(isProgressItem));
        if (listItems.length) return listItems;
        const items = Array.from(document.querySelectorAll('div, a')).filter(isProgressItem);
        return items.filter(el => !items.some(child => child !== el && el.contains(child)));
    }

    function isActiveLesson(el) {
        const activeClass = node => /(?:^|\s)(?:active|current|selected)(?:\s|$)/.test(String(node && node.className || ''));
        return activeClass(el) || activeClass(el.parentElement) ||
            Array.from(el.querySelectorAll('[class]')).some(activeClass);
    }

    function getActiveLessonElement() {
        return getLessonItems().find(isActiveLesson);
    }

    // =========================================================================
    // 3. 灵活补时策略
    // =========================================================================
    function handleLessonEnding(video, platformProgress) {
        if (config.compensateMode === 'no_compensate') {
            showStatus("已选[播完即切]，正在直接切换下一节...");
            setTimeout(switchToNextLessonOrCourse, 1200);
            return;
        }

        if (platformProgress !== null && platformProgress >= 100) {
            showStatus("平台已确认 100% 学满，正在切换下一节...");
            setTimeout(switchToNextLessonOrCourse, 1200);
            return;
        }

        // 结尾静音驻留补时：停留在末尾静音挂机，等平台心跳累加到 100%
        if (config.compensateMode === 'stay_end') {
            if (!video._stayEndStart) video._stayEndStart = Date.now();
            var stayDurationSec = Math.floor((Date.now() - video._stayEndStart) / 1000);

            showStatus(`视频播完，有效学时为 ${platformProgress || 0}%，静音驻留补时中(${stayDurationSec}s)...`);

            if (video.duration && video.currentTime >= video.duration - 0.5) {
                video.currentTime = Math.max(0, video.duration - 2.5);
                video.muted = true;
                video.play().catch(() => {});
            }

            setTimeout(() => {
                const currentPct = getCurrentLessonPlatformProgress();
                if (currentPct !== null && currentPct >= 100) {
                    video._stayEndStart = null;
                    showStatus("平台已成功补满 100%，正在切换下一节...");
                    switchToNextLessonOrCourse();
                } else if (stayDurationSec >= 15) {
                    // 若页面 DOM 超过 15 秒未局部刷新进度百分比，刷新页面获取最新学习进度
                    video._stayEndStart = null;
                    showStatus("页面DOM未局部更新进度，正在自动刷新同步平台学时...");
                    console.log("[jsgsHelper] 驻留满15秒，自动刷新页面以获取后台已累积的学时");
                    location.reload();
                } else {
                    isNavigating = false;
                }
            }, 3000);
            return;
        }

        if (config.compensateMode === 'loop_replay') {
            if (!video._loopReplayCount) video._loopReplayCount = 0;
            video._loopReplayCount++;
            if (video._loopReplayCount >= 2 && (!platformProgress || platformProgress < 100)) {
                // 如果已经重播过但页面进度显示没变，刷新页面更新真实学时
                video._loopReplayCount = 0;
                showStatus("检测到页面进度未动态刷新，正在自动刷新加载最新学时...");
                console.log("[jsgsHelper] 页面进度未实时显示，自动刷新页面获取新进度");
                location.reload();
                return;
            }

            showStatus(`有效学时为 ${platformProgress || 0}%，自动从头重播以补满时长...`);
            setTimeout(() => {
                video.currentTime = 0;
                video.play().catch(() => {});
                isNavigating = false;
            }, 1000);
        }
    }

    function switchToNextLessonOrCourse() {
        const allItems = getLessonItems();
        if (!allItems.length) {
            showStatus('未找到课时进度，请刷新页面后重试');
            isNavigating = false;
            return;
        }
        if (isAllLessonsFinished(allItems)) {
            handleCrossCourseNext();
            return;
        }

        const activeIndex = allItems.findIndex(isActiveLesson);
        const isIncomplete = el => parseFloat((el.innerText || '').match(/(\d+(?:\.\d+)?)\s*%/)?.[1] || '0') < 100;
        const nextNode = allItems.slice(activeIndex + 1).find(isIncomplete) || allItems.find(isIncomplete);

        if (nextNode) {
            nextNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
            nextNode.click();

            setTimeout(() => {
                isNavigating = false;
                const v = document.querySelector('video');
                if (v) {
                    v.muted = config.autoMute;
                    v.playbackRate = config.speed;
                    v.play().catch(() => {});
                }
            }, 2200);
        } else {
            handleCrossCourseNext();
        }
    }

    function isAllLessonsFinished(items) {
        if (!items || items.length === 0) return false;
        return items.every(el => {
            const progress = (el.innerText || '').match(/(\d+(?:\.\d+)?)\s*%/);
            return progress && parseFloat(progress[1]) >= 100;
        });
    }

    function handleCrossCourseNext() {
        const curId = getCurrentCourseId();
        const curIdx = COURSE_QUEUE.findIndex(c => c.id === String(curId));

        if (config.crossCourse && curIdx >= 0 && curIdx < COURSE_QUEUE.length - 1) {
            const nextCourse = COURSE_QUEUE[curIdx + 1];
            showStatus(`本课程已全满！3秒后进入下一门:《${nextCourse.name}》...`);

            setTimeout(() => {
                window.location.href = `http://jsgs.study.gspxonline.com/resource/index?route=/study/course/${nextCourse.id}#/study/learn/${nextCourse.id}`;
            }, 3000);
        } else if (curIdx >= 0 && curIdx === COURSE_QUEUE.length - 1) {
            showStatus("队列中的课程已全部完成！");
            isNavigating = false;
            alert("【提示】队列中的课程学习内容已显示 100%！");
        } else {
            showStatus("本课程已学完。跨课连播未配置或已关闭。");
            isNavigating = false;
        }
    }

    // =========================================================================
    // 3.5 增强弹窗自动关闭 (含多窗口冲突弹窗)
    // =========================================================================
    function dismissDialogs() {
        const buttons = Array.from(document.querySelectorAll('button, .el-button, span, a')).filter(btn => {
            const t = (btn.innerText || '').trim();
            return (t.includes('确定') || t.includes('继续学习') || t.includes('知道了') ||
                    t.includes('确认') || t.includes('关闭') || t.includes('我知道了') ||
                    t.includes('继续') || t.includes('重新学习') || t.includes('返回学习')) &&
                    btn.offsetHeight > 0;
        });

        for (const btn of buttons) {
            const modal = btn.closest('.el-dialog, .el-message-box, .dialog, .modal, [role="dialog"]');
            if (modal) {
                const modalText = modal.innerText || '';
                const isConflictDialog = modalText.includes('已在') || modalText.includes('其他') ||
                    modalText.includes('已经') || modalText.includes('打开') ||
                    modalText.includes('冲突') || modalText.includes('别的') ||
                    modalText.includes('异地') || modalText.includes('离开') ||
                    modalText.includes('其它') || modalText.includes('踢出') ||
                    modalText.includes('下线');

                if (isConflictDialog) {
                    console.log("[jsgsHelper] 自动关闭多窗口冲突弹窗:", btn.innerText);
                    btn.click();
                    setTimeout(() => {
                        const v = document.querySelector('video');
                        if (v && v.paused && !v.ended && config.enabled) {
                            v.play().catch(() => {});
                        }
                    }, 500);
                    continue;
                }

                console.log("[jsgsHelper] 自动关闭防挂机弹窗:", btn.innerText);
                btn.click();
            }
        }
    }

    // =========================================================================
    // 4. 悬浮控制面板 (HUD)
    // =========================================================================
    function createUI() {
        if (document.getElementById('study-assistant-hud')) return;
        const curId = getCurrentCourseId();
        const curCourse = COURSE_QUEUE.find(c => c.id === String(curId)) || { name: curId ? `课程 ${curId}` : '未进入课程' };

        const hud = document.createElement('div');
        hud.id = 'study-assistant-hud';

        const compensateModeLabels = {
            'stay_end': '结尾静音驻留(推荐)',
            'no_compensate': '播完即切(不补时)',
            'loop_replay': '循环重播补时'
        };

        let isCollapsed = localStorage.getItem('gspx_hud_collapsed') === 'true';

        hud.innerHTML = `
            <!-- 折叠图标：展开的课本与播放标记 -->
            <div id="hud-collapsed-view" role="button" tabindex="0" aria-label="展开学习播放助手" style="display: ${isCollapsed ? 'flex' : 'none'};" title="点击展开，拖动可移动">
                <svg viewBox="0 0 32 32" width="27" height="27" fill="none" aria-hidden="true">
                    <path d="M4.5 9c4.3-1.3 7.9-.7 11.5 1.7C19.6 8.3 23.2 7.7 27.5 9v15.1c-4.3-1.3-7.9-.7-11.5 1.7-3.6-2.4-7.2-3-11.5-1.7V9Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                    <path d="M16 10.7v15.1" stroke="currentColor" stroke-width="1.8"/>
                    <path d="m19.5 13.3 5 3.7-5 3.7v-7.4Z" fill="currentColor"/>
                </svg>
            </div>

            <!-- 完整面板容器 (展开状态) -->
            <div id="hud-expanded-view" style="display: ${isCollapsed ? 'none' : 'block'}; position: relative; width: 280px;">
                <!-- 内部面板主体 -->
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.18);">
                    <div id="hud-drag-handle" style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;" title="按住空白处拖动面板">
                        <span style="font-weight: 700; font-size: 13px; color: #0284c7;">学习播放助手 <small>V5.0</small></span>
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <button id="btn-master-toggle" style="padding: 2px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; border: 1px solid #0284c7; background: ${config.enabled ? '#0284c7' : '#94a3b8'}; color: #fff; font-weight: 600;">
                                ${config.enabled ? '接管中' : '已暂停'}
                            </button>
                            <button id="btn-collapse" aria-label="收起面板" style="padding: 2px 7px; border-radius: 4px; font-size: 11px; cursor: pointer; border: 1px solid #cbd5e1; background: #f8fafc; color: #475569; font-weight: 700;" title="收起面板">
                                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true"><path d="m5 8 5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span id="hud-course-name" style="font-size: 11px; color: #1e293b; font-weight: 600;">当前: ${curCourse.name}</span>
                        <span id="hud-pct" style="background: #059669; color: #fff; padding: 1px 6px; border-radius: 3px; font-size: 10px;">视频:0% · 平台:0%</span>
                    </div>

                    <div id="hud-status" role="status" aria-live="polite" style="font-size: 11px; color: #64748b; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">正在检测视频状态…</div>
                    <div id="hud-progress-track" aria-hidden="true"><span id="hud-progress-fill"></span></div>
                    <button id="btn-playback-toggle" type="button" aria-pressed="${window._allowUserPause}">
                        <svg class="hud-pause-icon" viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true"><path d="M6 4v12M14 4v12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
                        <svg class="hud-play-icon" viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true"><path d="m6 4 10 6-10 6V4Z" fill="currentColor"/></svg>
                        <span id="hud-playback-label">${window._allowUserPause ? '继续播放' : '暂停视频'}</span>
                    </button>
                    <div id="hud-refresh-row">
                        <label for="input-refresh">进度刷新</label>
                        <input id="input-refresh" type="number" min="0" max="120" step="1" value="${config.refreshMinutes}" title="刷新间隔，0 表示关闭定时刷新">
                        <span>分钟</span>
                        <button id="btn-refresh-now" type="button" title="立即刷新页面并同步平台进度">
                            <svg viewBox="0 0 20 20" width="13" height="13" fill="none" aria-hidden="true"><path d="M16 9a6 6 0 1 0 1 4M16 4v5h-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            立即刷新
                        </button>
                    </div>

                    <div style="display: flex; gap: 4px; align-items: center; margin-bottom: 6px;">
                        <label for="input-course-queue" style="white-space: nowrap;">跨课顺序</label>
                        <input id="input-course-queue" type="text" value="${COURSE_QUEUE.map(c => c.id).join(',')}" placeholder="课程ID，如 991,1088" title="按顺序填写已报名课程 ID；仅保存在当前标签会话" style="min-width: 0; flex: 1; padding: 3px 5px; border: 1px solid #cbd5e1; border-radius: 5px; font-size: 10px;">
                    </div>
                    <!-- 当前标签会话的跨课队列 -->
                    <div style="display: flex; gap: 4px; margin-bottom: 8px;">
                        ${COURSE_QUEUE.map((c, i) => `
                            <div id="c-step-${c.id}" ${c.id === String(curId) ? 'aria-current="step"' : ''} style="flex: 1; text-align: center; font-size: 10px; padding: 3px 0; border-radius: 3px; background: ${c.id === String(curId) ? '#0284c7; color: #fff; font-weight: 600;' : '#e2e8f0; color: #64748b;'}; cursor: pointer;" title="点击直达: ${c.name}" onclick="location.href='http://jsgs.study.gspxonline.com/resource/index?route=/study/course/${c.id}#/study/learn/${c.id}'">
                                ${i+1}
                            </div>
                        `).join('') || '<span style="color:#64748b;font-size:10px;">未配置跨课队列，仅接管当前课程</span>'}
                    </div>

                    <!-- 补时模式选择与自主配置 -->
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px; margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span style="font-size: 11px; color: #475569; font-weight: 500;">补时策略:</span>
                            <button id="btn-toggle-compensate" style="padding: 2px 6px; font-size: 10px; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer; background: #fff; color: #0369a1; font-weight: 600;">
                                ${compensateModeLabels[config.compensateMode] || '结尾静音驻留(推荐)'}
                            </button>
                        </div>

                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span style="font-size: 11px; color: #475569; font-weight: 500;">播放倍速:</span>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <input id="input-speed" type="number" step="0.1" min="0.5" max="16.0" value="${config.speed}" style="width: 48px; padding: 1px 3px; border: 1px solid #cbd5e1; border-radius: 3px; font-size: 11px; text-align: center; font-weight: 600; color: #0284c7;">
                                <span style="font-size: 11px; color: #64748b;">x</span>
                            </div>
                        </div>

                        <!-- 预设倍速按钮 (动态点亮高亮指示) -->
                        <div style="display: flex; gap: 4px;">
                            <button class="btn-preset-speed" data-rate="1.0" style="flex:1; padding: 3px 0; font-size: 10px; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; background: #fff; color: #334155;">1.0x</button>
                            <button class="btn-preset-speed" data-rate="1.5" style="flex:1; padding: 3px 0; font-size: 10px; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; background: #fff; color: #334155;">1.5x</button>
                            <button class="btn-preset-speed" data-rate="2.0" style="flex:1; padding: 3px 0; font-size: 10px; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; background: #fff; color: #334155;">2.0x</button>
                            <button class="btn-preset-speed" data-rate="2.5" style="flex:1; padding: 3px 0; font-size: 10px; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; background: #fff; color: #334155;">2.5x</button>
                        </div>
                    </div>

                    <!-- 控制开关 -->
                    <div style="display: flex; gap: 4px; margin-bottom: 4px;">
                        <button id="btn-toggle-next" style="flex: 1; padding: 4px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; background: ${config.autoNext ? '#e0f2fe' : '#f1f5f9'}; color: ${config.autoNext ? '#0369a1' : '#64748b'}; font-weight: 500;">
                            小节连播: ${config.autoNext ? '开' : '关'}
                        </button>
                        <button id="btn-toggle-cross" style="flex: 1.2; padding: 4px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; background: ${config.crossCourse ? '#e0f2fe' : '#f1f5f9'}; color: ${config.crossCourse ? '#0369a1' : '#64748b'}; font-weight: 500;">
                            跨课连播: ${config.crossCourse ? '开' : '关'}
                        </button>
                        <button id="btn-toggle-mute" style="flex: 0.8; padding: 4px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; background: ${config.autoMute ? '#dcfce7' : '#fee2e2'}; color: ${config.autoMute ? '#15803d' : '#b91c1c'}; font-weight: 500;">
                            静音: ${config.autoMute ? '是' : '否'}
                        </button>
                    </div>

                    <div style="font-size: 10px; color: #059669; text-align: right;">后台播放状态取决于浏览器与平台</div>
                </div>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            #study-assistant-hud { color: #1e293b; font-size: 11px; }
            #hud-expanded-view { width: 100% !important; }
            #hud-expanded-view > div:last-child { background: #fff !important; border: 1px solid #dce5ee !important; border-radius: 12px !important; padding: 11px !important; box-shadow: 0 10px 28px #233b5426 !important; }
            #hud-drag-handle { cursor: grab; user-select: none; touch-action: none; }
            #hud-drag-handle:active { cursor: grabbing; }
            #hud-expanded-view small { color: #94a3b8; font-size: 10px; font-weight: 500; }
            #hud-pct { border-radius: 999px !important; padding: 2px 6px !important; white-space: nowrap; }
            #hud-status { color: #64748b !important; line-height: 1.4; }
            #hud-progress-track { height: 4px; background: #e8eff5; border-radius: 999px; overflow: hidden; margin: 0 0 8px; }
            #hud-progress-fill { display: block; width: 0; height: 100%; background: #0284c7; border-radius: inherit; transition: width .2s; }
            #study-assistant-hud button { font-family: inherit; }
            #study-assistant-hud button:focus-visible, #hud-collapsed-view:focus-visible, #study-assistant-hud input:focus-visible { outline: 2px solid #0284c7 !important; outline-offset: 2px; }
            #btn-collapse { display: inline-flex; align-items: center; justify-content: center; }
            #btn-playback-toggle { display: flex; align-items: center; justify-content: center; gap: 5px; width: 100%; padding: 5px; margin: 0 0 8px; background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 6px; color: #0369a1; font-size: 11px; font-weight: 600; cursor: pointer; }
            #btn-playback-toggle[aria-pressed="true"] { background: #f1f5f9; border-color: #cbd5e1; color: #475569; }
            #btn-playback-toggle .hud-play-icon { display: none; }
            #btn-playback-toggle[aria-pressed="true"] .hud-play-icon { display: block; }
            #btn-playback-toggle[aria-pressed="true"] .hud-pause-icon { display: none; }
            #hud-refresh-row { display: flex; align-items: center; gap: 5px; margin: 0 0 8px; color: #475569; }
            #hud-refresh-row label { white-space: nowrap; }
            #input-refresh { width: 46px; padding: 3px 4px; color: #334155; background: #fff; border: 1px solid #cbd5e1; border-radius: 5px; font-size: 11px; text-align: center; }
            #btn-refresh-now { display: inline-flex; align-items: center; justify-content: center; gap: 3px; margin-left: auto; padding: 3px 6px; color: #0369a1; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 5px; font-size: 10px; white-space: nowrap; cursor: pointer; }
            #hud-expanded-view [id^="c-step-"][aria-current="step"] { background: #0284c7 !important; color: #fff !important; }
            #hud-collapsed-view { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; color: #fff; background: #0284c7; border: 1px solid #e0f2fe; border-radius: 14px; box-shadow: 0 5px 16px #07598555; cursor: grab; user-select: none; touch-action: none; }
            #hud-collapsed-view:active { cursor: grabbing; }
            @media (prefers-reduced-motion: reduce) { #hud-progress-fill { transition: none; } }
        `;
        hud.appendChild(style);

        Object.assign(hud.style, {
            position: 'fixed',
            top: '70px',
            right: '25px',
            width: isCollapsed ? '48px' : 'min(280px, calc(100vw - 28px))',
            zIndex: '99999999',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: '#1e293b'
        });
        document.body.appendChild(hud);

        const collapsedView = document.getElementById('hud-collapsed-view');
        const expandedView = document.getElementById('hud-expanded-view');
        const positionKey = 'gspx_hud_position';
        const placeHud = (x, y) => {
            hud.style.left = `${Math.min(Math.max(8, x), Math.max(8, window.innerWidth - hud.offsetWidth - 8))}px`;
            hud.style.top = `${Math.min(Math.max(8, y), Math.max(8, window.innerHeight - hud.offsetHeight - 8))}px`;
            hud.style.right = 'auto';
        };
        const saveHudPosition = () => localStorage.setItem(positionKey, JSON.stringify({
            x: parseFloat(hud.style.left), y: parseFloat(hud.style.top)
        }));
        try {
            const saved = JSON.parse(localStorage.getItem(positionKey));
            if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) placeHud(saved.x, saved.y);
        } catch (_) {}
        window.addEventListener('resize', () => {
            const rect = hud.getBoundingClientRect();
            placeHud(rect.left, rect.top);
        });

        let ignoreCollapsedClick = false;
        const startDrag = event => {
            if (event.button !== 0 || event.target.closest('button, input')) return;
            const handle = event.currentTarget;
            if (handle.setPointerCapture) handle.setPointerCapture(event.pointerId);
            const rect = hud.getBoundingClientRect();
            const startX = event.clientX;
            const startY = event.clientY;
            let moved = false;
            const move = next => {
                if (next.pointerId !== event.pointerId) return;
                const dx = next.clientX - startX;
                const dy = next.clientY - startY;
                if (!moved && Math.hypot(dx, dy) < 4) return;
                moved = true;
                next.preventDefault();
                placeHud(rect.left + dx, rect.top + dy);
            };
            const stop = next => {
                if (next.pointerId !== event.pointerId) return;
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', stop);
                window.removeEventListener('pointercancel', stop);
                if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId);
                if (moved) {
                    saveHudPosition();
                    if (handle === collapsedView) {
                        ignoreCollapsedClick = true;
                        setTimeout(() => { ignoreCollapsedClick = false; }, 0);
                    }
                }
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', stop);
            window.addEventListener('pointercancel', stop);
        };
        document.getElementById('hud-drag-handle').addEventListener('pointerdown', startDrag);
        collapsedView.addEventListener('pointerdown', startDrag);

        const doCollapse = () => {
            const rect = hud.getBoundingClientRect();
            isCollapsed = true;
            localStorage.setItem('gspx_hud_collapsed', 'true');
            hud.style.width = '48px';
            expandedView.style.display = 'none';
            collapsedView.style.display = 'flex';
            placeHud(rect.right - hud.offsetWidth, rect.top);
            saveHudPosition();
        };

        const doExpand = () => {
            const rect = hud.getBoundingClientRect();
            isCollapsed = false;
            localStorage.setItem('gspx_hud_collapsed', 'false');
            hud.style.width = 'min(280px, calc(100vw - 28px))';
            collapsedView.style.display = 'none';
            expandedView.style.display = 'block';
            placeHud(rect.right - hud.offsetWidth, rect.top);
            saveHudPosition();
        };

        document.getElementById('btn-collapse').addEventListener('click', doCollapse);
        collapsedView.addEventListener('click', () => {
            if (!ignoreCollapsedClick) doExpand();
        });
        collapsedView.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                doExpand();
            }
        });

        const playbackButton = document.getElementById('btn-playback-toggle');
        const playbackLabel = document.getElementById('hud-playback-label');
        playbackButton.addEventListener('click', () => {
            const video = document.querySelector('video');
            if (!video) {
                showStatus('当前页面尚未找到视频');
                return;
            }
            if (!window._allowUserPause && video.paused) {
                video._studyRetryAfter = 0;
                video.play().then(() => {
                    playbackLabel.textContent = '暂停视频';
                    showStatus('视频已开始播放');
                }).catch(() => showStatus('浏览器仍阻止播放，请点击视频原生播放按钮'));
                return;
            }
            window._allowUserPause = !window._allowUserPause;
            playbackButton.setAttribute('aria-pressed', String(window._allowUserPause));
            playbackLabel.textContent = window._allowUserPause ? '继续播放' : '暂停视频';
            if (window._allowUserPause) video.pause();
            else video.play().catch(() => showStatus('播放被浏览器阻止，请点击视频播放按钮'));
            showStatus(window._allowUserPause ? '已手动暂停' : '正在继续播放');
        });

        // 刷新倍速按钮亮起外观
        function refreshSpeedButtonStyles() {
            document.querySelectorAll('.btn-preset-speed').forEach(btn => {
                const r = parseFloat(btn.dataset.rate);
                if (Math.abs(r - config.speed) < 0.05) {
                    btn.setAttribute('aria-pressed', 'true');
                    btn.style.background = '#0284c7';
                    btn.style.color = '#ffffff';
                    btn.style.borderColor = '#0284c7';
                    btn.style.fontWeight = '700';
                    btn.style.boxShadow = '0 2px 4px rgba(2,132,199,0.3)';
                } else {
                    btn.setAttribute('aria-pressed', 'false');
                    btn.style.background = '#ffffff';
                    btn.style.color = '#334155';
                    btn.style.borderColor = '#cbd5e1';
                    btn.style.fontWeight = '500';
                    btn.style.boxShadow = 'none';
                }
            });
        }
        refreshSpeedButtonStyles();

        document.getElementById('btn-master-toggle').addEventListener('click', () => {
            config.enabled = !config.enabled;
            localStorage.setItem('gspx_master_enabled', config.enabled);

            window._masterEnabled = config.enabled;
            window._allowUserPause = !config.enabled;
            playbackButton.setAttribute('aria-pressed', String(window._allowUserPause));
            playbackLabel.textContent = window._allowUserPause ? '继续播放' : '暂停视频';

            const btn = document.getElementById('btn-master-toggle');
            btn.innerText = config.enabled ? '接管中' : '已暂停';
            btn.style.background = config.enabled ? '#0284c7' : '#94a3b8';
            btn.setAttribute('aria-pressed', String(config.enabled));
            showStatus(config.enabled ? '已恢复插件全自动接管' : '已暂停插件，所有控制交还给您');
        });
        document.getElementById('btn-master-toggle').setAttribute('aria-pressed', String(config.enabled));
        playbackButton.setAttribute('aria-pressed', String(window._allowUserPause));
        playbackLabel.textContent = window._allowUserPause ? '继续播放' : '暂停视频';

        document.getElementById('input-refresh').addEventListener('change', event => {
            const raw = event.target.value.trim();
            const minutes = Number(raw);
            if (!/^\d+$/.test(raw) || minutes > 120) {
                event.target.value = config.refreshMinutes;
                showStatus('请输入 0 到 120 的整数分钟，0 表示关闭');
                return;
            }
            config.refreshMinutes = minutes;
            localStorage.setItem('gspx_refresh_minutes', String(config.refreshMinutes));
            lastRefreshAt = Date.now();
            showStatus(config.refreshMinutes ? `每 ${config.refreshMinutes} 分钟刷新页面同步进度` : '已关闭定时刷新');
        });
        document.getElementById('btn-refresh-now').addEventListener('click', () => {
            refreshProgressPage(document.querySelector('video'));
        });
        document.getElementById('input-course-queue').addEventListener('change', event => {
            const parsed = parseCourseQueue(event.target.value.trim());
            if (!parsed) {
                event.target.value = COURSE_QUEUE.map(c => c.id).join(',');
                showStatus('请输入最多 30 个课程 ID，以逗号分隔');
                return;
            }
            COURSE_QUEUE = parsed;
            sessionStorage.setItem(courseQueueKey, COURSE_QUEUE.map(c => c.id).join(','));
            showStatus(COURSE_QUEUE.length ? '跨课顺序已保存到当前标签；刷新后生效' : '已清空跨课队列');
        });

        const modes = ['stay_end', 'no_compensate', 'loop_replay'];
        document.getElementById('btn-toggle-compensate').addEventListener('click', () => {
            const nextIdx = (modes.indexOf(config.compensateMode) + 1) % modes.length;
            config.compensateMode = modes[nextIdx];
            localStorage.setItem('gspx_compensate_mode', config.compensateMode);
            const btn = document.getElementById('btn-toggle-compensate');
            btn.innerText = compensateModeLabels[config.compensateMode];
            showStatus(`补时策略已调整为: ${compensateModeLabels[config.compensateMode]}`);
        });

        const speedInput = document.getElementById('input-speed');
        speedInput.addEventListener('change', () => {
            const val = parseFloat(speedInput.value);
            if (val > 0 && val <= 16) {
                applySpeed(val);
                refreshSpeedButtonStyles();
            }
        });

        document.querySelectorAll('.btn-preset-speed').forEach(btn => {
            btn.addEventListener('click', () => {
                const r = parseFloat(btn.dataset.rate);
                applySpeed(r);
                speedInput.value = r;
                refreshSpeedButtonStyles();
            });
        });

        document.getElementById('btn-toggle-next').addEventListener('click', () => {
            config.autoNext = !config.autoNext;
            localStorage.setItem('gspx_auto_next', config.autoNext);
            const btn = document.getElementById('btn-toggle-next');
            btn.innerText = `小节连播: ${config.autoNext ? '开' : '关'}`;
            btn.style.background = config.autoNext ? '#e0f2fe' : '#f1f5f9';
            btn.style.color = config.autoNext ? '#0369a1' : '#64748b';
            btn.setAttribute('aria-pressed', String(config.autoNext));
        });

        document.getElementById('btn-toggle-cross').addEventListener('click', () => {
            config.crossCourse = !config.crossCourse;
            localStorage.setItem('gspx_cross_course', config.crossCourse);
            const btn = document.getElementById('btn-toggle-cross');
            btn.innerText = `跨课连播: ${config.crossCourse ? '开' : '关'}`;
            btn.style.background = config.crossCourse ? '#e0f2fe' : '#f1f5f9';
            btn.style.color = config.crossCourse ? '#0369a1' : '#64748b';
            btn.setAttribute('aria-pressed', String(config.crossCourse));
        });

        document.getElementById('btn-toggle-mute').addEventListener('click', () => {
            config.autoMute = !config.autoMute;
            localStorage.setItem('gspx_auto_mute', config.autoMute);
            const btn = document.getElementById('btn-toggle-mute');
            btn.innerText = `静音: ${config.autoMute ? '是' : '否'}`;
            btn.style.background = config.autoMute ? '#dcfce7' : '#fee2e2';
            btn.style.color = config.autoMute ? '#15803d' : '#b91c1c';
            btn.setAttribute('aria-pressed', String(config.autoMute));
            const v = document.querySelector('video');
            if (v) v.muted = config.autoMute;
        });
        ['next', 'cross', 'mute'].forEach((name, i) => {
            document.getElementById(`btn-toggle-${name}`).setAttribute('aria-pressed', String([config.autoNext, config.crossCourse, config.autoMute][i]));
        });
    }

    function applySpeed(rate) {
        config.speed = rate;
        localStorage.setItem('gspx_custom_speed', rate);

        window._targetSpeed = rate;
        window._userExplicitSpeed1 = (rate === 1);

        const v = document.querySelector('video');
        if (v) v.playbackRate = rate;
        showStatus(`已设置速度为 ${rate}x`);
    }

    function updateUI(videoPercent, platformProgress, progressLabel = '视频') {
        const pctEl = document.getElementById('hud-pct');
        if (!pctEl) return;
        const progress = Math.max(0, Math.min(100, platformProgress ?? videoPercent ?? 0));
        document.getElementById('hud-progress-fill').style.width = `${progress}%`;
        if (!config.enabled) {
            pctEl.innerText = "已暂停";
            pctEl.style.background = "#94a3b8";
            return;
        }
        if (platformProgress !== null) {
            pctEl.innerText = `${progressLabel}:${Math.floor(videoPercent ?? 0)}% · 平台:${Math.floor(platformProgress)}%`;
            pctEl.style.background = platformProgress >= 100 ? '#059669' : '#d97706';
        } else if (videoPercent !== null) {
            pctEl.innerText = `${progressLabel}:${Math.floor(videoPercent)}%`;
        }
    }

    function showStatus(text) {
        const sEl = document.getElementById('hud-status');
        if (sEl) sEl.innerText = text;
    }

    function tick() {
        if (!document.body) return;
        if (!document.getElementById('study-assistant-hud')) createUI();
        mainLoop();
    }
    tick();
    checkTimer = setInterval(tick, 1000);
})();
