"""Build the privacy-safe static bundle published by GitHub Pages."""

from pathlib import Path
import json
import os
import re
import shutil

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "_site"

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir()

for name in ("index.html", "webbook.css", "webbook.js"):
    shutil.copy2(ROOT / name, OUT / name)

course_data = (ROOT / "course_data.js").read_text(encoding="utf-8")
course_data = re.sub(r'("onlineUrl"\s*:\s*)"[^"]*"', r'\1""', course_data)
(OUT / "course_data.js").write_text(course_data, encoding="utf-8")

for name in ("subtitles",):
    source = ROOT / name
    if source.exists():
        shutil.copytree(source, OUT / name)

config = {
    "hosted": True,
    "videoBaseUrl": os.environ.get("VIDEO_BASE_URL", "").rstrip("/"),
    "supabaseUrl": os.environ.get("SUPABASE_URL", "").rstrip("/"),
    "supabaseAnonKey": os.environ.get("SUPABASE_ANON_KEY", ""),
}
(OUT / "config.js").write_text(
    "// Generated during deployment.\nwindow.__DIGESTLECT_CONFIG__ = "
    + json.dumps(config, ensure_ascii=False, indent=2)
    + ";\n",
    encoding="utf-8",
)
(OUT / ".nojekyll").touch()
print(f"Prepared {OUT}")
