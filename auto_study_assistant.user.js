// ==UserScript==
// @name         江苏高校岗培学习平台 - 全自动多集连播与无人值守助手
// @namespace    https://antigravity.deepmind/
// @version      2.0.0
// @description  专为江苏省高校师资培训平台打造：自动多集连播、防切屏暂停、自动倍速(2.0x)、自动静音、秒关防挂机弹窗，全自动刷满学时
// @author       Antigravity
// @match        *://jsgs.study.gspxonline.com/*
// @match        *://*.gspxonline.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    console.log("[自动学习助手] 模块加载，防切屏拦截引擎启动...");

    // ==========================================
    // 1. 核心黑科技：彻底破解后台防切屏暂停
    // ==========================================
    try {
        Object.defineProperty(document, 'hidden', { get: () => false });
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
        Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible' });
        window.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
        window.addEventListener('webkitvisibilitychange', e => e.stopImmediatePropagation(), true);
        window.addEventListener('blur', e => e.stopImmediatePropagation(), true);
        document.addEventListener('mouseleave', e => e.stopImmediatePropagation(), true);
    } catch (e) {}

    // 全局控制状态
    const config = {
        autoNext: true,       // 自动切换下一集
        rate: 2.0,            // 播放倍速 (2.0x)
        autoMute: true,       // 自动静音挂机
        autoDismiss: true     // 自动关闭弹窗
    };

    let checkTimer = null;
    let isSwitching = false;

    // ==========================================
    // 2. 视频与进度监控核心引擎
    // ==========================================
    function mainLoop() {
        const video = document.querySelector('video');

        // 2.1 自动关闭各类挂机弹窗与提示
        if (config.autoDismiss) {
            dismissDialogs();
        }

        if (!video) return;

        // 2.2 确保视频处于播放状态
        if (video.paused && !video.ended && !isSwitching) {
            video.muted = config.autoMute;
            video.playbackRate = config.rate;
            video.play().catch(() => {});
        }

        // 2.3 保持倍速与静音设置
        if (video.playbackRate !== config.rate) {
            video.playbackRate = config.rate;
        }
        if (config.autoMute && !video.muted) {
            video.muted = true;
        }

        // 2.4 检查当前进度并更新 UI
        const duration = video.duration || 0;
        const curTime = video.currentTime || 0;
        const percent = duration > 0 ? (curTime / duration) * 100 : 0;
        updateUI(percent);

        // 2.5 判断本集是否已播完（已到末尾或 >= 99% 或 video.ended）
        if ((percent >= 99 || video.ended) && config.autoNext && !isSwitching) {
            console.log("[自动学习助手] 当前课时已学完，准备自动跳转下一集...");
            isSwitching = true;
            switchToNextLesson();
        }
    }

    // ==========================================
    // 3. 自动查找并点击下一节课时
    // ==========================================
    function switchToNextLesson() {
        showStatus("本节已学完，1.5 秒后自动播放下一节...");

        setTimeout(() => {
            // 获取左侧所有的课时列表元素
            const allItems = Array.from(document.querySelectorAll('li, div, a')).filter(el => {
                const t = el.innerText || '';
                const hasLessonKeyword = t.includes('节') || t.includes('讲') || t.includes('%');
                const isLeaf = el.children.length <= 4 && el.offsetHeight > 0;
                return isLeaf && hasLessonKeyword;
            });

            // 查找当前激活的节点
            const activeIndex = allItems.findIndex(el => {
                const cls = (el.className || '') + ' ' + (el.parentElement ? el.parentElement.className : '');
                return cls.includes('active') || cls.includes('current') || cls.includes('selected');
            });

            // 优先查找下一个节点
            let nextNode = null;
            if (activeIndex >= 0 && activeIndex < allItems.length - 1) {
                nextNode = allItems[activeIndex + 1];
            } else {
                // 如果当前未高亮，查找第一个进度未达 100% 的课时
                nextNode = allItems.find(el => {
                    const t = el.innerText;
                    return !t.includes('100%');
                });
            }

            if (nextNode) {
                console.log("[自动学习助手] 正在切换至:", nextNode.innerText.trim().slice(0, 20));
                nextNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
                nextNode.click();

                // 2 秒后重置 switching 状态，等待新视频加载
                setTimeout(() => {
                    isSwitching = false;
                    const v = document.querySelector('video');
                    if (v) {
                        v.muted = config.autoMute;
                        v.playbackRate = config.rate;
                        v.play().catch(() => {});
                    }
                }, 2500);
            } else {
                showStatus("恭喜！当前课程所有课时已全部播放完毕！");
                isSwitching = false;
            }
        }, 1500);
    }

    // ==========================================
    // 4. 秒级自动关闭弹窗
    // ==========================================
    function dismissDialogs() {
        const buttons = Array.from(document.querySelectorAll('button, .el-button, span, a')).filter(btn => {
            const t = (btn.innerText || '').trim();
            return (t.includes('确定') || t.includes('继续学习') || t.includes('知道了') || t.includes('确认')) && btn.offsetHeight > 0;
        });

        for (const btn of buttons) {
            const modal = btn.closest('.el-dialog, .el-message-box, .dialog, .modal, [role="dialog"]');
            if (modal) {
                console.log("[自动学习助手] 自动关闭防挂机弹窗:", btn.innerText);
                btn.click();
            }
        }
    }

    // ==========================================
    // 5. 页面悬浮控制面板 (HUD)
    // ==========================================
    function createUI() {
        if (document.getElementById('study-assistant-hud')) return;
        const hud = document.createElement('div');
        hud.id = 'study-assistant-hud';
        hud.innerHTML = `
            <div style="font-weight: bold; font-size: 13px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #0284c7;">⚡ 岗培全自动连播助手</span>
                <span id="hud-pct" style="background: #10b981; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px;">0%</span>
            </div>
            <div id="hud-status" style="font-size: 11px; color: #64748b; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">自动连播挂机运行中...</div>
            <div style="display: flex; gap: 6px; margin-bottom: 6px;">
                <button id="btn-toggle-next" style="flex: 1; padding: 5px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; background: #e0f2fe; color: #0369a1; font-weight: bold;">连播: 开启</button>
                <button id="btn-rate" style="flex: 1; padding: 5px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; background: #f8fafc; color: #334155;">倍速: 2.0x</button>
                <button id="btn-mute" style="flex: 1; padding: 5px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; background: #dcfce7; color: #15803d;">静音: 是</button>
            </div>
            <div style="font-size: 10px; color: #94a3b8; text-align: right;">已开启防切屏与弹窗秒关</div>
        `;
        Object.assign(hud.style, {
            position: 'fixed',
            top: '70px',
            right: '25px',
            width: '260px',
            background: '#ffffff',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '12px',
            zIndex: '99999999',
            fontFamily: 'sans-serif',
            color: '#1e293b'
        });
        document.body.appendChild(hud);

        // 绑定按钮事件
        document.getElementById('btn-toggle-next').addEventListener('click', () => {
            config.autoNext = !config.autoNext;
            const btn = document.getElementById('btn-toggle-next');
            btn.innerText = `连播: ${config.autoNext ? '开启' : '关闭'}`;
            btn.style.background = config.autoNext ? '#e0f2fe' : '#f1f5f9';
            btn.style.color = config.autoNext ? '#0369a1' : '#64748b';
        });

        document.getElementById('btn-rate').addEventListener('click', () => {
            const rates = [1.0, 1.25, 1.5, 2.0];
            const nextIdx = (rates.indexOf(config.rate) + 1) % rates.length;
            config.rate = rates[nextIdx];
            document.getElementById('btn-rate').innerText = `倍速: ${config.rate}x`;
            const v = document.querySelector('video');
            if (v) v.playbackRate = config.rate;
        });

        document.getElementById('btn-mute').addEventListener('click', () => {
            config.autoMute = !config.autoMute;
            const btn = document.getElementById('btn-mute');
            btn.innerText = `静音: ${config.autoMute ? '是' : '否'}`;
            btn.style.background = config.autoMute ? '#dcfce7' : '#fee2e2';
            btn.style.color = config.autoMute ? '#15803d' : '#b91c1c';
            const v = document.querySelector('video');
            if (v) v.muted = config.autoMute;
        });
    }

    function updateUI(percent) {
        const pctEl = document.getElementById('hud-pct');
        if (pctEl) pctEl.innerText = `${Math.floor(percent)}%`;
    }

    function showStatus(text) {
        const sEl = document.getElementById('hud-status');
        if (sEl) sEl.innerText = text;
    }

    // 页面就绪后启动主引擎
    window.addEventListener('DOMContentLoaded', () => {
        createUI();
        if (checkTimer) clearInterval(checkTimer);
        checkTimer = setInterval(mainLoop, 1000);
    });

    if (document.readyState !== 'loading') {
        createUI();
        if (checkTimer) clearInterval(checkTimer);
        checkTimer = setInterval(mainLoop, 1000);
    }
})();
