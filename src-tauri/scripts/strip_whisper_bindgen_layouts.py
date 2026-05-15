"""Strip bindgen layout-test const blocks from whisper-rs-sys bindings (cross-platform)."""
from __future__ import annotations

import sys
from pathlib import Path


def strip_layout_consts(src: str) -> str:
    marker = "const _: () = {"
    allow = "#[allow(clippy::unnecessary_operation, clippy::identity_op)]\n"
    out: list[str] = []
    i = 0
    n = len(src)
    while i < n:
        if src.startswith(allow, i) and src.startswith(marker, i + len(allow)):
            j = i + len(allow) + len(marker)
            depth = 1
            while j < n and depth > 0:
                c = src[j]
                if c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                j += 1
            while j < n and src[j] in " \t\r":
                j += 1
            if j < n and src[j] == ";":
                j += 1
            if j < n and src[j] == "\n":
                j += 1
            i = j
            continue
        if src.startswith(marker, i):
            j = i + len(marker)
            depth = 1
            while j < n and depth > 0:
                c = src[j]
                if c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                j += 1
            while j < n and src[j] in " \t\r":
                j += 1
            if j < n and src[j] == ";":
                j += 1
            if j < n and src[j] == "\n":
                j += 1
            i = j
            continue
        out.append(src[i])
        i += 1
    return "".join(out)


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    path = root / "vendor" / "whisper-rs-sys" / "src" / "bindings.rs"
    if not path.is_file():
        print("missing", path, file=sys.stderr)
        return 1
    text = path.read_text(encoding="utf-8")
    new = strip_layout_consts(text)
    path.write_text(new, encoding="utf-8", newline="\n")
    print("stripped layout const blocks ->", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
