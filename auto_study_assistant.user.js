// ==UserScript==
// @name         江苏高校岗培 - 全自动跨课连播与多窗口学习助手(V4.0)
// @namespace    https://github.com/Simple53/jsgsHelper
// @version      4.0.0
// @description  彻底终结切屏/失焦/最小化暂停(EventTarget级拦截+捕获阶段阻断+WebAudio保活)、支持多窗口同时学习(BroadcastChannel隔离+会话冲突拦截+自动关闭冲突弹窗)、解除进度条拖动限制、自由倍速、5门课程自动跨课连播
// @author       Simple53
// @match        *://jsgs.study.gspxonline.com/*
// @match        *://*.gspxonline.com/*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';
    console.log("[jsgsHelper V4.0] 启动：防切屏 + 多窗口并行学习引擎已加载...");

    // =========================================================================
    // 0. 主页面上下文核心注入：从底层彻底阻断切屏暂停 + 多窗口冲突
    // =========================================================================
    const injectionCode = `
    (function() {
        console.log("[jsgsHelper 内核] 正在安装防切屏拦截器、多窗口隔离层与媒体控制增强...");

        window._masterEnabled = localStorage.getItem('gspx_master_enabled') !== 'false';
        window._targetSpeed = parseFloat(localStorage.getItem('gspx_custom_speed') || '1.0');
        window._allowUserPause = false;
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
        // 核心突破 4：Chrome 后台保活 (Web Audio API 极微弱音频保活)
        // =============================================================
        try {
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                var actx = new AudioCtx();
                var osc = actx.createOscillator();
                var gain = actx.createGain();
                gain.gain.value = 0.00001;
                osc.connect(gain);
                gain.connect(actx.destination);
                osc.start();
                if (actx.state === 'suspended') {
                    var resumeAudio = function() { actx.resume(); window.removeEventListener('click', resumeAudio); };
                    origAddEventListener.call(window, 'click', resumeAudio);
                }
            }
        } catch(e) {}

        // =============================================================
        // 核心突破 5：拦截意外 pause 调用
        // =============================================================
        var origPause = HTMLMediaElement.prototype.pause;
        HTMLMediaElement.prototype.pause = function() {
            if (!window._masterEnabled || window._allowUserPause || window._isSeeking) {
                return origPause.apply(this, arguments);
            }
            if (this.duration && this.currentTime < this.duration - 0.8) {
                console.log("[jsgsHelper] 拦截非预期 pause 调用，保持播放");
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

        // 8a: XHR 响应拦截
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
                                console.log("[jsgsHelper] 检测到可能的会话冲突响应: " + url.slice(0, 60));
                                try {
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
                                        Object.defineProperty(xhr, 'responseText', { get: function() { return newText; }, configurable: true });
                                        Object.defineProperty(xhr, 'response', { get: function() { return newText; }, configurable: true });
                                        console.log("[jsgsHelper] 已中和会话冲突响应");
                                    }
                                } catch(e) {}
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

                // 中和会话冲突相关方法 (多窗口支持)
                if (v.stopSessionHeartbeat && !v._jsgsPatched) {
                    v._jsgsPatched = true;
                    v.stopSessionHeartbeat = function() {
                        console.log("[jsgsHelper] 拦截 stopSessionHeartbeat (多窗口保护)");
                    };
                }
                if (v._onStudyVis && !v._jsgsVisPatched) {
                    v._jsgsVisPatched = true;
                    v._onStudyVis = function() {
                        console.log("[jsgsHelper] 拦截 _onStudyVis");
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
        setInterval(function() {
            var v = document.querySelector('video');
            if (!v) return;

            if (!v._seekBound) {
                v._seekBound = true;
                origAddEventListener.call(v, 'seeking', function() { window._isSeeking = true; });
                origAddEventListener.call(v, 'seeked', function() { setTimeout(function() { window._isSeeking = false; }, 350); });
            }

            unlockSeekAndNeutralizeConflict();

            if (!window._masterEnabled) return;

            if (window._targetSpeed && Math.abs(v.playbackRate - window._targetSpeed) > 0.05) {
                if (origDesc && origDesc.set) origDesc.set.call(v, window._targetSpeed);
                else v.playbackRate = window._targetSpeed;
            }

            if (v.paused && !v.ended && v.currentTime < (v.duration || 999999) - 0.8 && !window._allowUserPause && !window._isSeeking) {
                v.play().catch(function() {});
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

        console.log("[jsgsHelper 内核] 防切屏 + 多窗口隔离 已完全就绪！TabID: " + window._tabId);
    })();
    `;

    // 双重注入机制
    try {
        const scriptEl = document.createElement('script');
        scriptEl.textContent = injectionCode;
        (document.head || document.documentElement).appendChild(scriptEl);
        scriptEl.remove();
    } catch(e) {}

    // =========================================================================
    // 1. 5 门官方培训核心考试课程标准队列
    // =========================================================================
    const COURSE_QUEUE = [
        { id: "991", name: "高等教育学" },
        { id: "1088", name: "高等教育心理学" },
        { id: "1072", name: "高等教育政策与法律" },
        { id: "993", name: "高校教师职业道德规范" },
        { id: "994", name: "习近平总书记教育重要论述" }
    ];

    const config = {
        enabled: localStorage.getItem('gspx_master_enabled') !== 'false',
        compensateMode: localStorage.getItem('gspx_compensate_mode') || 'stay_end',
        speed: parseFloat(localStorage.getItem('gspx_custom_speed') || '1.0'),
        autoNext: localStorage.getItem('gspx_auto_next') !== 'false',
        crossCourse: localStorage.getItem('gspx_cross_course') !== 'false',
        autoMute: localStorage.getItem('gspx_auto_mute') !== 'false',
        autoDismiss: true
    };

    let checkTimer = null;
    let isNavigating = false;
    let listCountdown = 3;
    let listCountdownTimer = null;

    function getCurrentCourseId() {
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        const match = hash.match(/\/learn\/(\d+)/) || search.match(/courseId=(\d+)/);
        return match ? match[1] : null;
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

        if (curHash.includes('/study/list') || curHash === '#/study' || curHash === '') {
            handleCourseListPage();
            return;
        }

        handleLearnPage();
    }

    function handleCourseListPage() {
        if (isNavigating) return;

        const firstCourse = COURSE_QUEUE[0];
        showStatus(`检测到在课程大厅，${listCountdown} 秒后自动开启第 1 门课程...`);

        if (!listCountdownTimer) {
            listCountdownTimer = setInterval(() => {
                listCountdown--;
                if (listCountdown <= 0) {
                    clearInterval(listCountdownTimer);
                    listCountdownTimer = null;
                    isNavigating = true;
                    showStatus(`正在跳转至第 1 门:《${firstCourse.name}》...`);
                    window.location.href = `http://jsgs.study.gspxonline.com/resource/index?route=/study/course/${firstCourse.id}#/study/learn/${firstCourse.id}`;
                } else {
                    showStatus(`检测到在课程大厅，${listCountdown} 秒后自动开启第 1 门课程...`);
                }
            }, 1000);
        }
    }

    function handleLearnPage() {
        if (listCountdownTimer) {
            clearInterval(listCountdownTimer);
            listCountdownTimer = null;
        }

        const video = document.querySelector('video');
        if (!video) return;

        if (config.autoMute && !video.muted) {
            video.muted = true;
        }

        if (video.paused && !video.ended && !isNavigating) {
            video.play().catch(() => {});
        }

        const duration = video.duration || 0;
        const curTime = video.currentTime || 0;
        const videoPercent = duration > 0 ? (curTime / duration) * 100 : 0;
        const platformProgress = getCurrentLessonPlatformProgress();

        updateUI(videoPercent, platformProgress);

        if ((videoPercent >= 99.0 || video.ended) && config.autoNext && !isNavigating) {
            isNavigating = true;
            handleLessonEnding(video, platformProgress);
        }
    }

    function getCurrentLessonPlatformProgress() {
        const activeItem = getActiveLessonElement();
        if (!activeItem) return null;
        const text = activeItem.innerText || '';
        const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
        return m ? parseFloat(m[1]) : (text.includes('100%') ? 100 : null);
    }

    function getActiveLessonElement() {
        const allItems = Array.from(document.querySelectorAll('li, div, a')).filter(el => {
            const t = el.innerText || '';
            const hasKeyword = t.includes('节') || t.includes('讲') || t.includes('%');
            const isLeaf = el.children.length <= 4 && el.offsetHeight > 0;
            return isLeaf && hasKeyword;
        });

        return allItems.find(el => {
            const cls = (el.className || '') + ' ' + (el.parentElement ? el.parentElement.className : '');
            return cls.includes('active') || cls.includes('current') || cls.includes('selected');
        });
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

        if (config.compensateMode === 'stay_end') {
            showStatus(`视频播完，有效学时为 ${platformProgress || 0}%，正在结尾静音驻留补时中...`);

            if (video.duration && video.currentTime >= video.duration - 0.5) {
                video.currentTime = Math.max(0, video.duration - 2.5);
                video.muted = true;
                video.play().catch(() => {});
            }

            setTimeout(() => {
                const currentPct = getCurrentLessonPlatformProgress();
                if (currentPct !== null && currentPct >= 100) {
                    showStatus("平台已成功补满 100%，正在切换下一节...");
                    switchToNextLessonOrCourse();
                } else {
                    isNavigating = false;
                }
            }, 3000);
            return;
        }

        if (config.compensateMode === 'loop_replay') {
            showStatus(`有效学时为 ${platformProgress}%，自动从头重播以补满时长...`);
            setTimeout(() => {
                video.currentTime = 0;
                video.play().catch(() => {});
                isNavigating = false;
            }, 1000);
        }
    }

    function switchToNextLessonOrCourse() {
        const allItems = Array.from(document.querySelectorAll('li, div, a')).filter(el => {
            const t = el.innerText || '';
            const hasKeyword = t.includes('节') || t.includes('讲') || t.includes('%');
            const isLeaf = el.children.length <= 4 && el.offsetHeight > 0;
            return isLeaf && hasKeyword;
        });

        const activeIndex = allItems.findIndex(el => {
            const cls = (el.className || '') + ' ' + (el.parentElement ? el.parentElement.className : '');
            return cls.includes('active') || cls.includes('current') || cls.includes('selected');
        });

        let nextNode = null;
        if (activeIndex >= 0 && activeIndex < allItems.length - 1) {
            nextNode = allItems[activeIndex + 1];
        } else {
            nextNode = allItems.find(el => !el.innerText.includes('100%'));
        }

        if (nextNode && !isAllLessonsFinished(allItems)) {
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
        const uncompleted = items.filter(el => !el.innerText.includes('100%'));
        return uncompleted.length === 0;
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
        } else if (curIdx >= COURSE_QUEUE.length - 1) {
            showStatus("5 门课程所有课时已全部圆满学完！");
            isNavigating = false;
            alert("【提示】全部 5 门培训课程的视频已全部自动连播学满 100%！");
        } else {
            showStatus("本课程已学完。跨课连播已关闭。");
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
        const curCourse = COURSE_QUEUE.find(c => c.id === String(curId)) || COURSE_QUEUE[0];

        const hud = document.createElement('div');
        hud.id = 'study-assistant-hud';

        const compensateModeLabels = {
            'stay_end': '结尾静音驻留(推荐)',
            'no_compensate': '播完即切(不补时)',
            'loop_replay': '循环重播补时'
        };

        hud.innerHTML = `
            <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600; font-size: 13px; color: #0284c7;">jsgsHelper (V4.0 多窗口)</span>
                <button id="btn-master-toggle" style="padding: 2px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; border: 1px solid #0284c7; background: ${config.enabled ? '#0284c7' : '#94a3b8'}; color: #fff; font-weight: 600;">
                    ${config.enabled ? '接管中' : '已暂停'}
                </button>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span id="hud-course-name" style="font-size: 11px; color: #1e293b; font-weight: 600;">当前: ${curCourse.name}</span>
                <span id="hud-pct" style="background: #059669; color: #fff; padding: 1px 6px; border-radius: 3px; font-size: 10px;">平台:0%</span>
            </div>

            <div id="hud-status" style="font-size: 11px; color: #64748b; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">防切屏 + 多窗口隔离已生效</div>

            <!-- 5门课程巡航指示器 -->
            <div style="display: flex; gap: 4px; margin-bottom: 8px;">
                ${COURSE_QUEUE.map((c, i) => `
                    <div id="c-step-${c.id}" style="flex: 1; text-align: center; font-size: 10px; padding: 3px 0; border-radius: 3px; background: ${c.id === String(curId) ? '#0284c7; color: #fff; font-weight: 600;' : '#e2e8f0; color: #64748b;'}; cursor: pointer;" title="点击直达: ${c.name}" onclick="location.href='http://jsgs.study.gspxonline.com/resource/index?route=/study/course/${c.id}#/study/learn/${c.id}'">
                        课${i+1}
                    </div>
                `).join('')}
            </div>

            <!-- 补时模式选择与自主配置 -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-size: 11px; color: #475569; font-weight: 500;">补时策略:</span>
                    <button id="btn-toggle-compensate" style="padding: 2px 6px; font-size: 10px; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer; background: #fff; color: #0369a1; font-weight: 600;">
                        ${compensateModeLabels[config.compensateMode] || '结尾静音驻留(推荐)'}
                    </button>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 11px; color: #475569; font-weight: 500;">播放倍速:</span>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <input id="input-speed" type="number" step="0.1" min="0.5" max="16.0" value="${config.speed}" style="width: 48px; padding: 1px 3px; border: 1px solid #cbd5e1; border-radius: 3px; font-size: 11px; text-align: center; font-weight: 600; color: #0284c7;">
                        <span style="font-size: 11px; color: #64748b;">x</span>
                    </div>
                </div>

                <div style="display: flex; gap: 4px;">
                    <button class="btn-preset-speed" data-rate="1.0" style="flex:1; padding: 2px 0; font-size: 10px; border: 1px solid #0284c7; border-radius: 3px; cursor: pointer; background: #e0f2fe; color: #0369a1; font-weight: 600;">1.0x</button>
                    <button class="btn-preset-speed" data-rate="1.5" style="flex:1; padding: 2px 0; font-size: 10px; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer; background: #fff;">1.5x</button>
                    <button class="btn-preset-speed" data-rate="2.0" style="flex:1; padding: 2px 0; font-size: 10px; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer; background: #fff;">2.0x</button>
                    <button class="btn-preset-speed" data-rate="2.5" style="flex:1; padding: 2px 0; font-size: 10px; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer; background: #fff;">2.5x</button>
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

            <div style="font-size: 10px; color: #059669; text-align: right;">防切屏 + 多窗口并行 + WebAudio保活</div>
        `;

        Object.assign(hud.style, {
            position: 'fixed',
            top: '70px',
            right: '25px',
            width: '280px',
            background: '#ffffff',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.18)',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '12px',
            zIndex: '99999999',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: '#1e293b'
        });
        document.body.appendChild(hud);

        document.getElementById('btn-master-toggle').addEventListener('click', () => {
            config.enabled = !config.enabled;
            localStorage.setItem('gspx_master_enabled', config.enabled);

            if (typeof unsafeWindow !== 'undefined') {
                unsafeWindow._masterEnabled = config.enabled;
                unsafeWindow._allowUserPause = !config.enabled;
            }
            window._masterEnabled = config.enabled;
            window._allowUserPause = !config.enabled;

            const btn = document.getElementById('btn-master-toggle');
            btn.innerText = config.enabled ? '接管中' : '已暂停';
            btn.style.background = config.enabled ? '#0284c7' : '#94a3b8';
            showStatus(config.enabled ? '已恢复插件全自动接管' : '已暂停插件，所有控制交还给您');
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
            if (val > 0 && val <= 16) applySpeed(val);
        });

        document.querySelectorAll('.btn-preset-speed').forEach(btn => {
            btn.addEventListener('click', () => {
                const r = parseFloat(btn.dataset.rate);
                applySpeed(r);
                speedInput.value = r;
            });
        });

        document.getElementById('btn-toggle-next').addEventListener('click', () => {
            config.autoNext = !config.autoNext;
            localStorage.setItem('gspx_auto_next', config.autoNext);
            const btn = document.getElementById('btn-toggle-next');
            btn.innerText = `小节连播: ${config.autoNext ? '开' : '关'}`;
            btn.style.background = config.autoNext ? '#e0f2fe' : '#f1f5f9';
            btn.style.color = config.autoNext ? '#0369a1' : '#64748b';
        });

        document.getElementById('btn-toggle-cross').addEventListener('click', () => {
            config.crossCourse = !config.crossCourse;
            localStorage.setItem('gspx_cross_course', config.crossCourse);
            const btn = document.getElementById('btn-toggle-cross');
            btn.innerText = `跨课连播: ${config.crossCourse ? '开' : '关'}`;
            btn.style.background = config.crossCourse ? '#e0f2fe' : '#f1f5f9';
            btn.style.color = config.crossCourse ? '#0369a1' : '#64748b';
        });

        document.getElementById('btn-toggle-mute').addEventListener('click', () => {
            config.autoMute = !config.autoMute;
            localStorage.setItem('gspx_auto_mute', config.autoMute);
            const btn = document.getElementById('btn-toggle-mute');
            btn.innerText = `静音: ${config.autoMute ? '是' : '否'}`;
            btn.style.background = config.autoMute ? '#dcfce7' : '#fee2e2';
            btn.style.color = config.autoMute ? '#15803d' : '#b91c1c';
            const v = document.querySelector('video');
            if (v) v.muted = config.autoMute;
        });
    }

    function applySpeed(rate) {
        config.speed = rate;
        localStorage.setItem('gspx_custom_speed', rate);

        window._targetSpeed = rate;
        if (typeof unsafeWindow !== 'undefined') {
            unsafeWindow._targetSpeed = rate;
            unsafeWindow._userExplicitSpeed1 = (rate === 1);
        }

        const v = document.querySelector('video');
        if (v) v.playbackRate = rate;
        showStatus(`已设置速度为 ${rate}x`);
    }

    function updateUI(videoPercent, platformProgress) {
        const pctEl = document.getElementById('hud-pct');
        if (!pctEl) return;
        if (!config.enabled) {
            pctEl.innerText = "已暂停";
            pctEl.style.background = "#94a3b8";
            return;
        }
        if (platformProgress !== null) {
            pctEl.innerText = `平台:${Math.floor(platformProgress)}%`;
            pctEl.style.background = platformProgress >= 100 ? '#059669' : '#d97706';
        } else if (videoPercent !== null) {
            pctEl.innerText = `播放:${Math.floor(videoPercent)}%`;
        }
    }

    function showStatus(text) {
        const sEl = document.getElementById('hud-status');
        if (sEl) sEl.innerText = text;
    }

    if (document.readyState !== 'loading') {
        createUI();
        if (checkTimer) clearInterval(checkTimer);
        checkTimer = setInterval(mainLoop, 1000);
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            createUI();
            if (checkTimer) clearInterval(checkTimer);
            checkTimer = setInterval(mainLoop, 1000);
        });
    }
})();
