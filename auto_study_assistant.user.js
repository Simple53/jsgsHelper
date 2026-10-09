// ==UserScript==
// @name         江苏高校岗培 - 5门课程全自动跨课连播与自定义倍速助手(V3.1)
// @namespace    https://antigravity.deepmind/
// @version      3.1.0
// @description  5门培训课程全自动按序跨课连播、支持任意自定义倍速(持久化记忆)、防切屏暂停、自动静音挂机、秒关弹窗，全自动通关学时
// @author       Antigravity
// @match        *://jsgs.study.gspxonline.com/*
// @match        *://*.gspxonline.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    console.log("[自动通关助手 V3.1] 启动：防切屏/跨课程调度引擎就绪...");

    // =========================================================================
    // 1. 核心破除限制：防切屏、防失焦、后台不暂停
    // =========================================================================
    try {
        Object.defineProperty(document, 'hidden', { get: () => false });
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
        Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible' });
        window.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
        window.addEventListener('webkitvisibilitychange', e => e.stopImmediatePropagation(), true);
        window.addEventListener('blur', e => e.stopImmediatePropagation(), true);
        document.addEventListener('mouseleave', e => e.stopImmediatePropagation(), true);
    } catch (e) {}

    // =========================================================================
    // 2. 5 门官方培训核心考试课程标准队列
    // =========================================================================
    const COURSE_QUEUE = [
        { id: "991", name: "高等教育学" },
        { id: "1088", name: "高等教育心理学" },
        { id: "1072", name: "高等教育政策与法律" },
        { id: "993", name: "高校教师职业道德规范" },
        { id: "994", name: "习近平总书记教育重要论述" }
    ];

    // 本地持久化配置读取
    const config = {
        speed: parseFloat(localStorage.getItem('gspx_custom_speed') || '2.0'),
        autoNext: localStorage.getItem('gspx_auto_next') !== 'false',
        crossCourse: localStorage.getItem('gspx_cross_course') !== 'false',
        autoMute: localStorage.getItem('gspx_auto_mute') !== 'false',
        autoDismiss: true
    };

    let checkTimer = null;
    let isNavigating = false;
    let listCountdown = 3;
    let listCountdownTimer = null;

    // 获取当前所在的课程 ID
    function getCurrentCourseId() {
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        const match = hash.match(/\/learn\/(\d+)/) || search.match(/courseId=(\d+)/);
        return match ? match[1] : null;
    }

    // =========================================================================
    // 3. 主循环心跳监控
    // =========================================================================
    function mainLoop() {
        // 自动关闭挂机确认弹窗
        if (config.autoDismiss) dismissDialogs();

        const curHash = window.location.hash || '';

        // 场景 A：位于课程大厅列表页 (#/study/list 或 #/study)
        if (curHash.includes('/study/list') || curHash === '#/study' || curHash === '') {
            handleCourseListPage();
            return;
        }

        // 场景 B：位于具体的课程学习页 (#/study/learn/...)
        handleLearnPage();
    }

    // 场景 A 处理：在课程大厅 (#/study/list)，自动按序进入第一门课程
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

    // 场景 B 处理：在学习页中自动连播与维持自定义倍速
    function handleLearnPage() {
        if (listCountdownTimer) {
            clearInterval(listCountdownTimer);
            listCountdownTimer = null;
        }

        const video = document.querySelector('video');
        if (!video) return;

        // 持续锁定用户自定义的播放速度
        if (Math.abs(video.playbackRate - config.speed) > 0.05) {
            video.playbackRate = config.speed;
        }
        // 持续静音
        if (config.autoMute && !video.muted) {
            video.muted = true;
        }

        // 若被意外暂停，自动触发播放
        if (video.paused && !video.ended && !isNavigating) {
            video.play().catch(() => {});
        }

        // 实时更新进度百分比
        const duration = video.duration || 0;
        const curTime = video.currentTime || 0;
        const percent = duration > 0 ? (curTime / duration) * 100 : 0;
        updateUI(percent);

        // 检查本课是否播放完毕（进度达到 99% 或触发 video.ended）
        if ((percent >= 99 || video.ended) && config.autoNext && !isNavigating) {
            isNavigating = true;
            console.log("[自动通关助手] 当前小节已学满，准备切换下一节...");
            switchToNextLessonOrCourse();
        }
    }

    // =========================================================================
    // 4. 课时切换与跨课程跳转引擎
    // =========================================================================
    function switchToNextLessonOrCourse() {
        showStatus("当前课时完成，正在定位下一节...");

        setTimeout(() => {
            // 获取左侧所有的课时项
            const allItems = Array.from(document.querySelectorAll('li, div, a')).filter(el => {
                const t = el.innerText || '';
                const hasKeyword = t.includes('节') || t.includes('讲') || t.includes('%');
                const isLeaf = el.children.length <= 4 && el.offsetHeight > 0;
                return isLeaf && hasKeyword;
            });

            // 查找当前选中的课时
            const activeIndex = allItems.findIndex(el => {
                const cls = (el.className || '') + ' ' + (el.parentElement ? el.parentElement.className : '');
                return cls.includes('active') || cls.includes('current') || cls.includes('selected');
            });

            // 1. 优先在本课程内找下一个尚未达到 100% 的课时
            let nextNode = null;
            if (activeIndex >= 0 && activeIndex < allItems.length - 1) {
                nextNode = allItems[activeIndex + 1];
            } else {
                // 如果当前已经是末尾，查找本课程内是否有遗漏的未达标课时
                nextNode = allItems.find(el => !el.innerText.includes('100%'));
            }

            if (nextNode && !isAllLessonsFinished(allItems)) {
                console.log("[自动通关助手] 播放本门课程下一讲:", nextNode.innerText.trim().slice(0, 20));
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
                // 2. 本门课程所有课时均已学满，触发跨课程无缝跳转！
                handleCrossCourseNext();
            }
        }, 1200);
    }

    function isAllLessonsFinished(items) {
        if (!items || items.length === 0) return false;
        const uncompleted = items.filter(el => !el.innerText.includes('100%'));
        return uncompleted.length === 0;
    }

    // 跨课程跳转到 5 门课程队列中的下一门
    function handleCrossCourseNext() {
        const curId = getCurrentCourseId();
        const curIdx = COURSE_QUEUE.findIndex(c => c.id === String(curId));

        if (config.crossCourse && curIdx >= 0 && curIdx < COURSE_QUEUE.length - 1) {
            const nextCourse = COURSE_QUEUE[curIdx + 1];
            showStatus(`本课程已全满！3秒后进入下一门:《${nextCourse.name}》...`);
            console.log(`[自动通关助手] 跨课切换 [${curIdx + 2}/5]: ${nextCourse.name}`);

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
    // 5. 自动秒关各类防挂机弹窗
    // =========================================================================
    function dismissDialogs() {
        const buttons = Array.from(document.querySelectorAll('button, .el-button, span, a')).filter(btn => {
            const t = (btn.innerText || '').trim();
            return (t.includes('确定') || t.includes('继续学习') || t.includes('知道了') || t.includes('确认')) && btn.offsetHeight > 0;
        });

        for (const btn of buttons) {
            const modal = btn.closest('.el-dialog, .el-message-box, .dialog, .modal, [role="dialog"]');
            if (modal) {
                console.log("[自动通关助手] 自动关闭防挂机弹窗:", btn.innerText);
                btn.click();
            }
        }
    }

    // =========================================================================
    // 6. 悬浮状态与自定义倍速控制卡片 (HUD)
    // =========================================================================
    function createUI() {
        if (document.getElementById('study-assistant-hud')) return;
        const curId = getCurrentCourseId();
        const curCourse = COURSE_QUEUE.find(c => c.id === String(curId)) || COURSE_QUEUE[0];

        const hud = document.createElement('div');
        hud.id = 'study-assistant-hud';
        hud.innerHTML = `
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #0284c7;">5门课程自动通关巡航助手</span>
                <span id="hud-pct" style="background: #059669; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px;">0%</span>
            </div>
            
            <div id="hud-course-name" style="font-size: 11px; color: #1e293b; font-weight: 600; margin-bottom: 4px;">当前课程: ${curCourse.name}</div>
            <div id="hud-status" style="font-size: 11px; color: #64748b; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">自动连播运行中...</div>

            <!-- 5门课程巡航指示器 -->
            <div style="display: flex; gap: 4px; margin-bottom: 8px;">
                ${COURSE_QUEUE.map((c, i) => `
                    <div id="c-step-${c.id}" style="flex: 1; text-align: center; font-size: 10px; padding: 3px 0; border-radius: 3px; background: ${c.id === String(curId) ? '#0284c7; color: #fff; font-weight: 600;' : '#e2e8f0; color: #64748b;'}; cursor: pointer;" title="点击直达: ${c.name}" onclick="location.href='http://jsgs.study.gspxonline.com/resource/index?route=/study/course/${c.id}#/study/learn/${c.id}'">
                        课${i+1}
                    </div>
                `).join('')}
            </div>

            <!-- 自定义速度控制区 -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 11px; color: #475569; font-weight: 500;">自定义播放倍速:</span>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <input id="input-speed" type="number" step="0.1" min="0.5" max="16.0" value="${config.speed}" style="width: 52px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 3px; font-size: 11px; text-align: center; font-weight: 600; color: #0284c7;">
                        <span style="font-size: 11px; color: #64748b;">×</span>
                    </div>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button class="btn-preset-speed" data-rate="1.0" style="flex:1; padding: 2px 0; font-size: 10px; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer; background: #fff;">1.0x</button>
                    <button class="btn-preset-speed" data-rate="1.5" style="flex:1; padding: 2px 0; font-size: 10px; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer; background: #fff;">1.5x</button>
                    <button class="btn-preset-speed" data-rate="2.0" style="flex:1; padding: 2px 0; font-size: 10px; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer; background: #fff;">2.0x</button>
                    <button class="btn-preset-speed" data-rate="2.5" style="flex:1; padding: 2px 0; font-size: 10px; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer; background: #fff;">2.5x</button>
                    <button class="btn-preset-speed" data-rate="3.0" style="flex:1; padding: 2px 0; font-size: 10px; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer; background: #fff;">3.0x</button>
                </div>
            </div>

            <!-- 控制开关 -->
            <div style="display: flex; gap: 4px;">
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
            <div style="font-size: 10px; color: #94a3b8; text-align: right; margin-top: 6px;">防切屏与弹窗秒关已开启</div>
        `;
        Object.assign(hud.style, {
            position: 'fixed',
            top: '70px',
            right: '25px',
            width: '275px',
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

        // 自定义倍速输入框绑定
        const speedInput = document.getElementById('input-speed');
        speedInput.addEventListener('change', () => {
            const val = parseFloat(speedInput.value);
            if (val > 0 && val <= 16) {
                applySpeed(val);
            }
        });

        // 预设倍速按钮绑定
        document.querySelectorAll('.btn-preset-speed').forEach(btn => {
            btn.addEventListener('click', () => {
                const r = parseFloat(btn.dataset.rate);
                applySpeed(r);
                speedInput.value = r;
            });
        });

        // 小节连播开关
        document.getElementById('btn-toggle-next').addEventListener('click', () => {
            config.autoNext = !config.autoNext;
            localStorage.setItem('gspx_auto_next', config.autoNext);
            const btn = document.getElementById('btn-toggle-next');
            btn.innerText = `小节连播: ${config.autoNext ? '开' : '关'}`;
            btn.style.background = config.autoNext ? '#e0f2fe' : '#f1f5f9';
            btn.style.color = config.autoNext ? '#0369a1' : '#64748b';
        });

        // 跨课连播开关
        document.getElementById('btn-toggle-cross').addEventListener('click', () => {
            config.crossCourse = !config.crossCourse;
            localStorage.setItem('gspx_cross_course', config.crossCourse);
            const btn = document.getElementById('btn-toggle-cross');
            btn.innerText = `跨课连播: ${config.crossCourse ? '开' : '关'}`;
            btn.style.background = config.crossCourse ? '#e0f2fe' : '#f1f5f9';
            btn.style.color = config.crossCourse ? '#0369a1' : '#64748b';
        });

        // 静音开关
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
        const v = document.querySelector('video');
        if (v) v.playbackRate = rate;
        showStatus(`已锁定播放速度为 ${rate}x`);
    }

    function updateUI(percent) {
        const pctEl = document.getElementById('hud-pct');
        if (pctEl) pctEl.innerText = `${Math.floor(percent)}%`;
    }

    function showStatus(text) {
        const sEl = document.getElementById('hud-status');
        if (sEl) sEl.innerText = text;
    }

    // 页面初始化
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
