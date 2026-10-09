"""Generate Chinese WebVTT subtitles for local course videos with faster-whisper."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from build_webbook import clean_filename

ROOT = Path(__file__).resolve().parent


def vtt_time(seconds: float) -> str:
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    secs, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{milliseconds:03d}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--course", type=int, help="Only process one 1-based course index")
    parser.add_argument("--limit", type=int, help="Stop after this many new subtitles")
    parser.add_argument("--model", default="small")
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--compute-type", default="int8", help="Use float16 for a CUDA GPU")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise SystemExit("Install first: python -m pip install faster-whisper") from exc

    courses = json.loads((ROOT / "course_videos.json").read_text(encoding="utf-8"))
    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    created = 0

    for course_index, course in enumerate(courses, 1):
        if args.course and course_index != args.course:
            continue
        folder = f"{course_index:02d}_{clean_filename(course['courseName'])}"
        for lesson_index, lesson in enumerate(course["videos"], 1):
            base = f"{lesson_index:02d}_{clean_filename(lesson['title'])}"
            video = ROOT / "videos" / folder / f"{base}.mp4"
            target = ROOT / "subtitles" / folder / f"{base}.vtt"
            if target.exists() or not video.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            print(f"Transcribing: {video.relative_to(ROOT)}", flush=True)
            segments, _ = model.transcribe(str(video), language="zh", vad_filter=True, beam_size=5)
            lines = ["WEBVTT", ""]
            for segment in segments:
                text = segment.text.strip()
                if text:
                    lines.extend((f"{vtt_time(segment.start)} --> {vtt_time(segment.end)}", text, ""))
            target.write_text("\n".join(lines), encoding="utf-8")
            created += 1
            if args.limit and created >= args.limit:
                print(f"Created {created} subtitle file(s). Run: python build_webbook.py")
                return

    print(f"Created {created} subtitle file(s). Run: python build_webbook.py")


if __name__ == "__main__":
    main()
