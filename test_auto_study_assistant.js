const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, 'auto_study_assistant.user.js'), 'utf8');
const instrumentedSource = source.replace(/\}\)\(\);\s*$/, 'window.__studyTest = { getCurrentCourseId, parseCourseQueue, maybeRefreshProgress, refreshProgressPage, restorePlaybackPosition, switchToNextLessonOrCourse, handleDocumentPage, config };})();');
assert.notEqual(instrumentedSource, source, 'test hook must reach the script closure');
const intervals = [];
const settings = new Map();
const sessionValues = new Map();
let lessonItems = [];
let pageInputs = [];
let pageButtons = [];
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
    querySelectorAll(selector) {
        if (selector === 'li') return lessonItems;
        if (selector === 'input') return pageInputs;
        if (selector.startsWith('button, [role=')) return pageButtons;
        return [];
    }
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
        this.playCount = 0;
    }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
    play() { this.playCount++; this.paused = false; return Promise.resolve(); }
}

const video = new FakeVideo();
const nativePause = video.pause;
const document = new FakeDocument();
const window = new EventTarget();
window.location = { hash: '#/study/learn/991', search: '', reload() { reloadCount++; } };
window.innerWidth = 1000;
window.innerHeight = 800;
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
    assert.equal(window.__studyTest.parseCourseQueue('991,1088,1072,993,994').map(course => course.id).join(','), '991,1088,1072,993,994', 'all default courses remain available');
    assert.equal(window.__studyTest.parseCourseQueue('').length, 0, 'users can disable the cross-course queue');
    assert.equal(window.__studyTest.parseCourseQueue('2001, 2002').map(course => course.id).join(','), '2001,2002', 'another account can configure its own courses');
    assert.equal(window.__studyTest.parseCourseQueue('2001,invalid'), null, 'invalid course IDs must be rejected');
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
    video.readyState = 1;
    video.duration = NaN;
    window.__studyTest.restorePlaybackPosition(video);
    assert.equal(video.currentTime, 0, 'unknown duration should not consume the saved position');
    assert.equal(sessionValues.has('gspx_refresh_resume'), true, 'saved position should survive until metadata is ready');
    video.duration = 100;
    window.__studyTest.restorePlaybackPosition(video);
    assert.equal(video.currentTime, 20, 'page reload should restore the saved playback position');
    video.currentTime = 42;
    window._allowUserPause = true;
    window.__studyTest.refreshProgressPage(video);
    assert.equal(reloadCount, 3, 'immediate refresh should reload without waiting');
    assert.equal(JSON.parse(sessionValues.get('gspx_refresh_resume')).time, 42, 'immediate refresh should save playback position');
    assert.equal(JSON.parse(sessionValues.get('gspx_refresh_resume')).manualPause, true, 'refresh should preserve manual pause');
    window._allowUserPause = false;
    window.dispatchEvent(new Event('blur'));
    now += 61000;
    window.dispatchEvent(new Event('focus'));
    assert.equal(reloadCount, 3, 'returning to the foreground must not reload the page');
    video.readyState = 4;
    const guard = intervals.find(item => item.ms === 300);
    video.paused = false;
    guard.fn();
    await Promise.resolve();
    await Promise.resolve();
    const playsBeforeStall = video.playCount;
    now += 16000;
    guard.fn();
    if (video.paused) guard.fn();
    assert.equal(video.playCount, playsBeforeStall + 1, 'unpaused video with a frozen timeline should restart');
    await Promise.resolve();
    await Promise.resolve();
    video.currentTime += 2;
    guard.fn();
    const playsAfterAdvance = video.playCount;
    now += 10000;
    guard.fn();
    assert.equal(video.playCount, playsAfterAdvance, 'advancing video should not be restarted');
    const lesson = (progress, active = false) => ({
        innerText: `第 1 讲 ${progress}%`, offsetHeight: 30,
        className: active ? 'active' : '', parentElement: { className: '' },
        closest: () => null, querySelectorAll: () => [],
        scrollIntoView() {}, click() { this.clicked = true; },
    });
    lessonItems = [lesson(100), lesson(100, true)];
    window.__studyTest.switchToNextLessonOrCourse();
    assert.match(window.location.href, /\/study\/learn\/1088$/, 'completed first course should open the second course');
    window.location.href = '';
    lessonItems = [lesson(100, true), lesson(20)];
    window.__studyTest.switchToNextLessonOrCourse();
    assert.equal(lessonItems[1].clicked, true, 'unfinished next lesson should open before another course');
    assert.equal(window.location.href, '', 'unfinished course must not open the next course');
    window.location.hash = '#/study/read/file';
    window.location.search = '?route=/study/course/994';
    assert.equal(window.__studyTest.getCurrentCourseId(), '994', 'document routes should keep the course id');
    lessonItems = [lesson(100, true), lesson(0)];
    pageInputs = [{ value: '1', parentElement: { parentElement: { innerText: '/ 2' } },
        getBoundingClientRect: () => ({ width: 40, left: 20, top: 150 }) }];
    pageButtons = [{ closest: () => null, getAttribute: name => name === 'class' ? 'arrow-right' : '',
        textContent: '', getBoundingClientRect: () => ({ width: 40, height: 40, left: 600, right: 640, top: 400 }),
        click() { pageInputs[0].value = '2'; } }];
    window.__studyTest.handleDocumentPage();
    assert.equal(pageInputs[0].value, '1', 'document pages should not be flipped instantly');
    now += 8001;
    window.__studyTest.handleDocumentPage();
    assert.equal(pageInputs[0].value, '2', 'document reader should advance to the next page');
    now += 8001;
    window.__studyTest.handleDocumentPage();
    now += 8001;
    window.__studyTest.handleDocumentPage();
    assert.equal(lessonItems[1].clicked, true, 'last document page should open the next unfinished file');
    console.log('playback, refresh, course and document checks passed');
}

check().catch(error => { console.error(error); process.exitCode = 1; });
