#!/usr/bin/env python3
"""
Generate Kupay brand PNGs from assets/brand/logo-master.png.

Each output uses a scale tuned to the target surface safe zone:
- Android adaptive foreground: 66/108 dp circle (~61% diameter); we use 67% art scale.
- Splash (Android 12+ circle mask + iOS): 80% art on 512 canvas + imageWidth in app.json.
- In-app logo.png: no OS mask — 92% art on 256 canvas.
- iOS icon.png: squircle mask — 70% art on 1024 canvas.
- Android monochrome: same inset as foreground (from mono master in git if present).

Run from apps/mobile:
  python3 scripts/generate-brand-assets.py
Then: npm run prebuild:clean && npm run android:run (or ios)
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "assets" / "brand" / "logo-master.png"
MONO_MASTER = ROOT / "assets" / "brand" / "logo-monochrome-master.png"
ASSETS = ROOT / "assets"

# --- Tuning constants (documented) ---
# Android adaptive: 66dp safe diameter / 108dp layer → ~61% max; 68% keeps arrows inside on most launchers.
ANDROID_FOREGROUND_SCALE = 0.68
ANDROID_MONOCHROME_SCALE = 0.68
# Splash: circle mask clips square corners; 88% art + platform imageWidth balances size vs clip.
SPLASH_SIZE = 512
SPLASH_SCALE = 0.88
LOGO_SIZE = 256
LOGO_SCALE = 0.96
IOS_ICON_SIZE = 1024
IOS_ICON_SCALE = 0.72


def ensure_pillow():
    try:
        import PIL  # noqa: F401
        return
    except ImportError:
        venv = Path(__file__).resolve().parent / ".venv-brand"
        if not (venv / "bin" / "python").exists():
            subprocess.check_call([sys.executable, "-m", "venv", str(venv)])
            subprocess.check_call(
                [str(venv / "bin" / "pip"), "install", "pillow"],
                stdout=subprocess.DEVNULL,
            )
        sys.path.insert(0, str(venv / "lib"))
        ver = f"python{sys.version_info.major}.{sys.version_info.minor}"
        site = venv / "lib" / ver / "site-packages"
        if site.exists():
            sys.path.insert(0, str(site))


def fit_center(
    master_path: Path,
    out_path: Path,
    canvas: int,
    scale: float,
    *,
    flatten_white: bool = False,
) -> None:
    from PIL import Image

    im = Image.open(master_path).convert("RGBA")
    art = int(canvas * scale)
    resized = im.resize((art, art), Image.Resampling.LANCZOS)
    bg = (255, 255, 255, 255)
    canvas_img = Image.new("RGBA", (canvas, canvas), bg)
    ox = (canvas - art) // 2
    oy = (canvas - art) // 2
    canvas_img.paste(resized, (ox, oy), resized)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if flatten_white:
        flat = Image.new("RGB", (canvas, canvas), (255, 255, 255))
        flat.paste(canvas_img, mask=canvas_img.split()[3])
        flat.save(out_path, "PNG", optimize=True)
    else:
        canvas_img.save(out_path, "PNG", optimize=True)
    print(f"  {out_path.relative_to(ROOT)}  canvas={canvas} art={art}px ({scale:.0%})")


def main() -> int:
    ensure_pillow()

    if not MASTER.is_file():
        print(f"Missing master: {MASTER}", file=sys.stderr)
        print("Add a 1024x1024 logo PNG as assets/brand/logo-master.png", file=sys.stderr)
        return 1

    print("Generating brand assets from logo-master.png …")
    fit_center(MASTER, ASSETS / "splash-icon.png", SPLASH_SIZE, SPLASH_SCALE, flatten_white=True)
    fit_center(MASTER, ASSETS / "logo.png", LOGO_SIZE, LOGO_SCALE, flatten_white=True)
    fit_center(
        MASTER,
        ASSETS / "android-icon-foreground.png",
        IOS_ICON_SIZE,
        ANDROID_FOREGROUND_SCALE,
        flatten_white=False,
    )
    fit_center(MASTER, ASSETS / "icon.png", IOS_ICON_SIZE, IOS_ICON_SCALE, flatten_white=True)

    mono_src = MONO_MASTER if MONO_MASTER.is_file() else MASTER
    fit_center(
        mono_src,
        ASSETS / "android-icon-monochrome.png",
        IOS_ICON_SIZE,
        ANDROID_MONOCHROME_SCALE,
        flatten_white=False,
    )

    print("\nDone. Update native projects:")
    print("  npm run prebuild:clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
