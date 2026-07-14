#!/usr/bin/env python3
"""Generate manifest.json: the sha256 of every language file in Lang/.

Why: the mod (LangUpdateService) fetches this one small file, hashes its local
language files, and downloads only the ones whose hash differs. An unchanged
language then costs a ~200 byte request instead of re-downloading the whole file
on every launch. It also lets the mod verify the bytes it downloaded.

Hashes are over the raw file bytes — exactly what raw.githubusercontent.com serves
— so a downloaded file written verbatim to disk re-hashes to the same value and is
not fetched again.

The manifest lives at the repo ROOT, not in Lang/, for two reasons: the workflow
filters on Lang/** so a manifest commit cannot retrigger it, and the mod's
Translator scans its local Lang folder for language files, where a stray
non-language JSON would just log noise.

Usage: gen_manifest.py [lang_dir] [out_file]
"""
import glob
import hashlib
import json
import os
import sys


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    lang_dir = sys.argv[1] if len(sys.argv) > 1 else "Lang"
    out = sys.argv[2] if len(sys.argv) > 2 else "manifest.json"
    files = {}
    for path in sorted(glob.glob(os.path.join(lang_dir, "*.json"))):
        files[os.path.basename(path)] = sha256(path)
    if not files:
        print(f"no *.json found in {lang_dir}", file=sys.stderr)
        return 1
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"version": 1, "files": files}, f, indent=2, ensure_ascii=False, sort_keys=True)
        f.write("\n")
    for name, digest in sorted(files.items()):
        print(f"{digest}  {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
