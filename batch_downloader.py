# -*- coding: utf-8 -*-
"""
江苏省高校师资培训中心 - 视频批量多线程下载器 (并发增强版)
特性：
1. 纯 Python 原生实现，不依赖外部工具
2. 自动注入 Referer 防盗链鉴权
3. MP4 支持重试与断点检测，支持多视频并发下载 (默认 3 个视频并发)
4. M3U8 自动解析 TS 分片、16 线程高速拉取并自动无缝拼接
5. 下载完成后自动输出全量完整性检查报告，并自动调用 build_webbook.py 刷新 Web Book
"""

import os
import sys
import json
import time
import argparse
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VIDEOS_DIR = os.path.join(BASE_DIR, "videos")
JSON_PATH = os.path.join(BASE_DIR, "course_videos.json")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "http://jsgs.study.gspxonline.com/",
    "Accept": "*/*"
}

def clean_filename(name):
    invalid_chars = r'\/:*?"<>|'
    for c in invalid_chars:
        name = name.replace(c, "_")
    return name.strip()

def download_mp4(url, out_path, max_retries=3):
    """下载单个 MP4 视频，带重试与断点检查"""
    if os.path.exists(out_path) and os.path.getsize(out_path) > 1024 * 100:
        return True, "already_exists"

    temp_path = out_path + ".tmp"
    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=45) as resp, open(temp_path, "wb") as f:
                while True:
                    chunk = resp.read(1024 * 512)
                    if not chunk:
                        break
                    f.write(chunk)
            if os.path.exists(temp_path) and os.path.getsize(temp_path) > 1024 * 100:
                if os.path.exists(out_path):
                    os.remove(out_path)
                os.rename(temp_path, out_path)
                return True, "success"
        except Exception as e:
            if attempt == max_retries:
                if os.path.exists(temp_path):
                    try: os.remove(temp_path)
                    except: pass
                return False, str(e)
            time.sleep(2)
    return False, "unknown_error"

def download_m3u8(url, out_path, max_workers=16):
    """解析 m3u8 并多线程下载 ts 分片合并为 mp4"""
    if os.path.exists(out_path) and os.path.getsize(out_path) > 1024 * 100:
        return True, "already_exists"

    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            content = resp.read().decode("utf-8")
    except Exception as e:
        return False, f"m3u8_error: {e}"

    base_url = url.rsplit("/", 1)[0] + "/"
    ts_urls = []
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("http://") or line.startswith("https://"):
            ts_urls.append(line)
        else:
            ts_urls.append(urllib.parse.urljoin(base_url, line))

    if not ts_urls:
        return False, "no_ts_found"

    total_ts = len(ts_urls)

    def fetch_ts(index, ts_url):
        for _ in range(3):
            try:
                r = urllib.request.Request(ts_url, headers=HEADERS)
                with urllib.request.urlopen(r, timeout=25) as res:
                    return index, res.read()
            except Exception:
                time.sleep(1)
        return index, None

    chunks = {}
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(fetch_ts, i, u) for i, u in enumerate(ts_urls)]
        for fut in as_completed(futures):
            idx, data = fut.result()
            if data is not None:
                chunks[idx] = data

    if len(chunks) < total_ts * 0.9:  # 丢失超过 10% 判为失败
        return False, f"ts_missing: {len(chunks)}/{total_ts}"

    temp_path = out_path + ".tmp"
    try:
        with open(temp_path, "wb") as outfile:
            for i in range(total_ts):
                if i in chunks:
                    outfile.write(chunks[i])
        if os.path.exists(out_path):
            os.remove(out_path)
        os.rename(temp_path, out_path)
        return True, "success"
    except Exception as e:
        if os.path.exists(temp_path):
            try: os.remove(temp_path)
            except: pass
        return False, str(e)

def process_single_video(item):
    """处理单个视频下载任务"""
    c_idx, cname, v_idx, total_in_course, video, course_dir = item
    title = clean_filename(video["title"])
    v_type = video.get("type", "mp4")
    v_url = video["url"]
    out_filename = f"{v_idx:02d}_{title}.mp4"
    out_path = os.path.join(course_dir, out_filename)

    t0 = time.time()
    if v_type == "m3u8" or ".m3u8" in v_url:
        ok, msg = download_m3u8(v_url, out_path)
    else:
        ok, msg = download_mp4(v_url, out_path)

    elapsed = time.time() - t0
    status_str = "已存在" if msg == "already_exists" else ("成功" if ok else f"失败({msg})")
    print(f"[{cname}] [{v_idx:02d}/{total_in_course:02d}] {status_str}: {title} ({elapsed:.1f}s)")
    return ok

def check_status():
    """检查全部课程视频的下载完整性"""
    if not os.path.exists(JSON_PATH):
        print("错误: 找不到 course_videos.json")
        return

    with open(JSON_PATH, "r", encoding="utf-8") as f:
        courses = json.load(f)

    print("\n==================================================================")
    print("                    课程视频下载完整性检查报告                     ")
    print("==================================================================")

    total_expected = 0
    total_downloaded = 0
    total_size_bytes = 0

    for c_idx, course in enumerate(courses, 1):
        cname = course["courseName"]
        videos = course["videos"]
        folder_name = f"{c_idx:02d}_{clean_filename(cname)}"
        course_dir = os.path.join(VIDEOS_DIR, folder_name)

        c_downloaded = 0
        c_size = 0
        missing_titles = []

        for v_idx, v in enumerate(videos, 1):
            title = clean_filename(v["title"])
            out_filename = f"{v_idx:02d}_{title}.mp4"
            out_path = os.path.join(course_dir, out_filename)
            if os.path.exists(out_path) and os.path.getsize(out_path) > 1024 * 100:
                c_downloaded += 1
                c_size += os.path.getsize(out_path)
            else:
                missing_titles.append(f"#{v_idx:02d} {v['title']}")

        total_expected += len(videos)
        total_downloaded += c_downloaded
        total_size_bytes += c_size

        pct = (c_downloaded / len(videos)) * 100 if len(videos) > 0 else 0
        status_flag = "√ 全部齐全" if c_downloaded == len(videos) else f"× 缺失 {len(missing_titles)} 部"
        print(f"[{c_idx}/5] {cname:<18} | 进度: {c_downloaded:02d}/{len(videos):02d} ({pct:5.1f}%) | 大小: {c_size/1024/1024:7.1f} MB | {status_flag}")

        if missing_titles and len(missing_titles) <= 5:
            for m in missing_titles:
                print(f"       待下载: {m}")
        elif missing_titles:
            print(f"       待下载: {missing_titles[0]} 等共 {len(missing_titles)} 部")

    print("------------------------------------------------------------------")
    overall_pct = (total_downloaded / total_expected) * 100 if total_expected > 0 else 0
    print(f"总体统计: 已就绪 {total_downloaded}/{total_expected} 部 ({overall_pct:5.1f}%) | 总占用空间: {total_size_bytes/1024/1024/1024:5.2f} GB")
    print("==================================================================\n")
    return total_downloaded == total_expected

def run_download(target_course_id=None, limit_per_course=None, video_workers=3):
    if not os.path.exists(JSON_PATH):
        print(f"错误: 找不到课程配置文件 {JSON_PATH}")
        return

    with open(JSON_PATH, "r", encoding="utf-8") as f:
        courses = json.load(f)

    os.makedirs(VIDEOS_DIR, exist_ok=True)

    for c_idx, course in enumerate(courses, 1):
        cid = course["courseId"]
        cname = course["courseName"]
        videos = course["videos"]

        if target_course_id and str(cid) != str(target_course_id) and str(c_idx) != str(target_course_id):
            continue

        folder_name = f"{c_idx:02d}_{clean_filename(cname)}"
        course_dir = os.path.join(VIDEOS_DIR, folder_name)
        os.makedirs(course_dir, exist_ok=True)

        to_download = videos[:limit_per_course] if limit_per_course else videos

        print(f"\n=======================================================")
        print(f"[{c_idx}/{len(courses)}] 开始下载: {cname} (本课程共 {len(to_download)} 个视频)")
        print(f"保存路径: {course_dir}")
        print(f"=======================================================")

        tasks = []
        for v_idx, video in enumerate(to_download, 1):
            tasks.append((c_idx, cname, v_idx, len(to_download), video, course_dir))

        # 判断是否为 M3U8，如果全是 M3U8，由于单个视频内部已经是 16 线程下载，外部视频并发设为 2；若是 MP4，则并发设为 3
        is_m3u8_course = any("m3u8" in v.get("type", "") or ".m3u8" in v.get("url", "") for v in to_download)
        current_workers = 2 if is_m3u8_course else video_workers

        with ThreadPoolExecutor(max_workers=current_workers) as executor:
            futures = [executor.submit(process_single_video, t) for t in tasks]
            for f in as_completed(futures):
                pass

    # 下载完毕后，执行全量完整性检查
    check_status()

    # 自动刷新 Web Book 数据
    try:
        import build_webbook
        build_webbook.build_webbook_data()
        print("Web Book 数据已自动刷新同步！")
    except Exception as e:
        print(f"刷新 Web Book 数据失败: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="网课视频批量下载器 (增强版)")
    parser.add_argument("--course", type=str, help="指定下载的课程编号或ID (例如: 1 或 991)")
    parser.add_argument("--limit", type=int, help="每门课程限制下载数量 (用于测试)")
    parser.add_argument("--workers", type=int, default=3, help="视频并发下载数 (默认 3)")
    parser.add_argument("--check", action="store_true", help="仅检查当前视频下载完整性")
    args = parser.parse_args()

    if args.check:
        check_status()
    else:
        run_download(target_course_id=args.course, limit_per_course=args.limit, video_workers=args.workers)
