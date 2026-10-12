const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, 'auto_study_assistant.user.js'), 'utf8');
const instrumentedSource = source.replace(/\}\)\(\);\s*$/, 'window.__studyTest = { maybeRefreshProgress, refreshProgressPage, restorePlaybackPosition, config };})();');
assert.notEqual(instrumentedSource, source, 'test hook must reach the script closure');
const intervals = [];
const settings = new Map();
const sessionValues = new Map();
let now = 1_000_000;
let reloadCount = 0;
class FakeDate extends Date { static now() { return now; } }

class FakeDocument extends EventTarget {
    constructor() {
        super();
        this.readyState = 'loading';
        this.documentElement = {};
        this.body = null;
    }
    querySelector(selector) { return selector === 'video' ? video : null; }
    getElementById() { return null; }
}

class FakeVideo extends EventTarget {
    constructor() {
        super();
        this.duration = 100;
        this.currentTime = 20;
        this.playbackRate = 1;
        this.paused = true;
        this.ended = false;
        this.readyState = 0;
    }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
    play() { this.paused = false; return Promise.resolve(); }
}

const video = new FakeVideo();
const nativePause = video.pause;
const document = new FakeDocument();
const window = new EventTarget();
window.location = { hash: '#/study/learn/991', search: '', reload() { reloadCount++; } };
const context = {
    EventTarget, Document: FakeDocument, HTMLMediaElement: FakeVideo,
    XMLHttpRequest: class extends EventTarget {},
    document, window, location: window.location,
    localStorage: { getItem: key => settings.get(key) ?? null },
    sessionStorage: {
        getItem: key => sessionValues.get(key) ?? null,
        setItem: (key, value) => sessionValues.set(key, value),
        removeItem: key => sessionValues.delete(key),
    },
    console: { log() {} }, Promise, Date: FakeDate, Math, Object, Array, String,
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
    setTimeout: fn => { fn(); return 1; },
};

async function check() {
    vm.runInNewContext(instrumentedSource, context);
    assert.equal(window._studyAssistantReady, true, 'page context must install its guard');
    assert.equal(window.__studyTest.config.refreshMinutes, 5, 'first run should refresh every five minutes');

    intervals.find(item => item.ms === 300).fn();
    assert.equal(video.paused, true, 'video without metadata should wait for readiness');
    video.readyState = 1;
    video.dispatchEvent(new Event('loadedmetadata'));
    assert.equal(video.paused, true, 'metadata alone should not trigger a premature play attempt');
    video.readyState = 4;
    video.dispatchEvent(new Event('canplay'));
    assert.equal(video.paused, false, 'canplay should start a late-loading video');
    assert.equal(video.muted, true, 'autoplay should mute before requesting playback');
    await Promise.resolve();
    await Promise.resolve();

    video.pause();
    assert.equal(video.paused, false, 'page pause should be intercepted during active playback');

    nativePause.call(video);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(video.paused, false, 'native pause should recover through the media event');
    window._allowUserPause = true;
    video.pause();
    assert.equal(video.paused, true, 'manual pause should be allowed');
    window._allowUserPause = false;
    video.paused = false;
    window.__studyTest.maybeRefreshProgress(video, 20);
    assert.equal(reloadCount, 0, 'refresh should wait for the configured interval');
    now += 300001;
    window.__studyTest.maybeRefreshProgress(video, 20);
    assert.equal(reloadCount, 1, 'refresh should reload the course page after five minutes');
    assert.equal(JSON.parse(sessionValues.get('gspx_refresh_resume')).time, 20, 'refresh should save playback position');
    window.__studyTest.config.refreshMinutes = 7;
    now += 6 * 60000;
    window.__studyTest.maybeRefreshProgress(video, 20);
    assert.equal(reloadCount, 1, 'custom interval should not refresh early');
    now += 60001;
    window.__studyTest.maybeRefreshProgress(video, 20);
    assert.equal(reloadCount, 2, 'custom seven-minute interval should refresh');
    video.currentTime = 0;
    video._studyPositionChecked = false;
    window.__studyTest.restorePlaybackPosition(video);
    assert.equal(video.currentTime, 20, 'page reload should restore the saved playback position');
    video.currentTime = 42;
    window.__studyTest.refreshProgressPage(video);
    assert.equal(reloadCount, 3, 'immediate refresh should reload without waiting');
    assert.equal(JSON.parse(sessionValues.get('gspx_refresh_resume')).time, 42, 'immediate refresh should save playback position');
    console.log('playback and refresh checks passed');
}

check().catch(error => { console.error(error); process.exitCode = 1; });
