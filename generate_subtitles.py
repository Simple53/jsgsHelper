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


def audio_chunks(path: Path, chunk_seconds: int, sampling_rate: int = 16_000):
    """Decode and resample incrementally so long lessons do not exhaust memory."""
    import av
    import numpy as np

    target_samples = chunk_seconds * sampling_rate
    parts = []
    buffered = 0
    offset = 0.0

    with av.open(str(path), mode="r") as container:
        resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=sampling_rate)

        def accept(frame):
            nonlocal parts, buffered, offset
            for converted in resampler.resample(frame):
                samples = converted.to_ndarray().reshape(-1).astype(np.int16, copy=False)
                parts.append(samples)
                buffered += len(samples)
                if buffered >= target_samples:
                    combined = np.concatenate(parts)
                    while len(combined) >= target_samples:
                        chunk = combined[:target_samples].astype(np.float32) / 32768.0
                        yield chunk, offset
                        offset += len(chunk) / sampling_rate
                        combined = combined[target_samples:]
                    parts = [combined] if len(combined) else []
                    buffered = len(combined)

        for decoded in container.decode(audio=0):
            yield from accept(decoded)
        yield from accept(None)

    if buffered:
        import numpy as np
        chunk = np.concatenate(parts).astype(np.float32) / 32768.0
        yield chunk, offset


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--course", type=int, help="Only process one 1-based course index")
    parser.add_argument("--lesson", type=int, help="Only process one 1-based lesson index")
    parser.add_argument("--limit", type=int, help="Stop after this many new subtitles")
    parser.add_argument("--model", default="small", help="Use medium for higher accuracy on a GPU, or base for lower memory")
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--compute-type", default="int8", help="Use float16 for a CUDA GPU")
    parser.add_argument("--chunk-minutes", type=int, default=1, help="Streaming chunk size; raise it on higher-memory systems")
    parser.add_argument("--beam-size", type=int, default=1)
    parser.add_argument("--cpu-threads", type=int, default=2)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise SystemExit("Install first: python -m pip install faster-whisper") from exc

    courses = json.loads((ROOT / "course_videos.json").read_text(encoding="utf-8"))
    model = WhisperModel(
        args.model,
        device=args.device,
        compute_type=args.compute_type,
        cpu_threads=args.cpu_threads,
        num_workers=1,
    )
    created = 0

    for course_index, course in enumerate(courses, 1):
        if args.course and course_index != args.course:
            continue
        folder = f"{course_index:02d}_{clean_filename(course['courseName'])}"
        for lesson_index, lesson in enumerate(course["videos"], 1):
            if args.lesson and lesson_index != args.lesson:
                continue
            base = f"{lesson_index:02d}_{clean_filename(lesson['title'])}"
            video = ROOT / "videos" / folder / f"{base}.mp4"
            target = ROOT / "subtitles" / folder / f"{base}.vtt"
            if (target.exists() and not args.overwrite) or not video.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            print(f"Transcribing: {video.relative_to(ROOT)}", flush=True)
            lines = ["WEBVTT", ""]
            for chunk_index, (audio, offset) in enumerate(audio_chunks(video, max(1, args.chunk_minutes) * 60), 1):
                print(f"  chunk {chunk_index} · {vtt_time(offset)}", flush=True)
                segments, _ = model.transcribe(audio, language="zh", vad_filter=True, beam_size=args.beam_size)
                for segment in segments:
                    text = segment.text.strip()
                    if text:
                        lines.extend((f"{vtt_time(offset + segment.start)} --> {vtt_time(offset + segment.end)}", text, ""))
            target.write_text("\n".join(lines), encoding="utf-8")
            created += 1
            if args.limit and created >= args.limit:
                print(f"Created {created} subtitle file(s). Run: python build_webbook.py")
                return

    print(f"Created {created} subtitle file(s). Run: python build_webbook.py")


if __name__ == "__main__":
    main()
