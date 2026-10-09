# -*- coding: utf-8 -*-
"""
Web Book 数据构建器
功能：
1. 读取 course_videos.json
2. 扫描 videos/ 目录标记本地视频文件存在状态
3. 扫描并解析 subtitles/ 目录下的 .vtt 字幕文件（内嵌解析为结构化数据，彻底解决 file:/// 协议跨域问题）
4. 扫描 summaries/ 目录下的 .md 课时总结笔记
5. 自动输出 course_data.js 供 index.html 交互式 Web Book 读取
"""

import os
import re
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_PATH = os.path.join(BASE_DIR, "course_videos.json")
VIDEOS_DIR = os.path.join(BASE_DIR, "videos")
SUBTITLES_DIR = os.path.join(BASE_DIR, "subtitles")
SUMMARIES_DIR = os.path.join(BASE_DIR, "summaries")
OUTPUT_JS = os.path.join(BASE_DIR, "course_data.js")

def clean_filename(name):
    invalid_chars = r'\/:*?"<>|'
    for c in invalid_chars:
        name = name.replace(c, "_")
    return name.strip()

def parse_vtt_time(time_str):
    """将 00:01:23.456 转换为秒数 float"""
    parts = time_str.strip().split(":")
    if len(parts) == 3:
        h, m, s = parts
        return int(h) * 3600 + int(m) * 60 + float(s)
    elif len(parts) == 2:
        m, s = parts
        return int(m) * 60 + float(s)
    return 0.0

def parse_vtt_file(file_path):
    """解析 VTT 字幕文件为 cue 列表"""
    if not os.path.exists(file_path):
        return []
    cues = []
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    cue_pattern = re.compile(r'((?:\d{2}:)?\d{2}:\d{2}[\.,]\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}[\.,]\d{3})')
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        match = cue_pattern.search(line)
        if match:
            start_str, end_str = match.group(1), match.group(2)
            start_sec = parse_vtt_time(start_str.replace(",", "."))
            end_sec = parse_vtt_time(end_str.replace(",", "."))
            i += 1
            text_lines = []
            while i < len(lines) and lines[i].strip():
                text_lines.append(lines[i].strip())
                i += 1
            text = " ".join(text_lines)
            cues.append({
                "start": start_sec,
                "end": end_sec,
                "startText": start_str.split(".")[0],
                "text": text
            })
        else:
            i += 1
    return cues

def build_webbook_data():
    if not os.path.exists(JSON_PATH):
        print(f"找不到 {JSON_PATH}")
        return

    with open(JSON_PATH, "r", encoding="utf-8") as f:
        courses = json.load(f)

    processed_courses = []

    for c_idx, course in enumerate(courses, 1):
        cid = course["courseId"]
        cname = course["courseName"]
        videos = course["videos"]

        folder_name = f"{c_idx:02d}_{clean_filename(cname)}"
        processed_videos = []

        for v_idx, video in enumerate(videos, 1):
            title = clean_filename(video["title"])
            base_name = f"{v_idx:02d}_{title}"

            rel_video_path = f"videos/{folder_name}/{base_name}.mp4"
            abs_video_path = os.path.join(VIDEOS_DIR, folder_name, f"{base_name}.mp4")
            video_exists = os.path.exists(abs_video_path)

            rel_vtt_path = f"subtitles/{folder_name}/{base_name}.vtt"
            abs_vtt_path = os.path.join(SUBTITLES_DIR, folder_name, f"{base_name}.vtt")
            vtt_exists = os.path.exists(abs_vtt_path)
            cues = parse_vtt_file(abs_vtt_path) if vtt_exists else []

            rel_summary_path = f"summaries/{folder_name}/{base_name}.md"
            abs_summary_path = os.path.join(SUMMARIES_DIR, folder_name, f"{base_name}.md")
            summary_content = ""
            if os.path.exists(abs_summary_path):
                with open(abs_summary_path, "r", encoding="utf-8") as sf:
                    summary_content = sf.read()

            processed_videos.append({
                "index": v_idx,
                "sourceId": video.get("sourceId"),
                "title": video["title"],
                "type": video.get("type", "mp4"),
                "onlineUrl": video["url"],
                "videoPath": rel_video_path,
                "videoExists": video_exists,
                "vttPath": rel_vtt_path,
                "vttExists": vtt_exists,
                "cues": cues,
                "summary": summary_content
            })

        processed_courses.append({
            "index": c_idx,
            "courseId": cid,
            "courseName": cname,
            "folder": folder_name,
            "count": len(videos),
            "videos": processed_videos
        })

    js_content = f"// 自动生成的课程与字幕 Web Book 元数据\nwindow.__COURSE_DATA__ = {json.dumps(processed_courses, ensure_ascii=False, indent=2)};\n"
    with open(OUTPUT_JS, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"数据构建完成: {OUTPUT_JS}")
    print(f"共包含 {len(processed_courses)} 门课程，全部课时与字幕数据已注入。")

if __name__ == "__main__":
    build_webbook_data()
