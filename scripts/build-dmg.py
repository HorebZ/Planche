import argparse
from pathlib import Path
import plistlib
import re
import subprocess
import tempfile

import dmgbuild
from ds_store import DSStore
from mac_alias import Alias
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent.parent
SIZE = (720, 480)
ICONS = {"Planche.app": (180, 268), "Applications": (540, 268)}
ICON_SIZE = 96


def color(name):
    tokens = (ROOT / "app/src/styles/tokens.css").read_text()
    match = re.search(rf"--pl-{name}: light-dark\(([^,]+),", tokens)
    if not match:
        raise ValueError(f"Missing light theme token: {name}")
    return match.group(1).strip()


def background(path, scale):
    def font(size, weight="Regular"):
        result = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", size * scale)
        result.set_variation_by_name(weight)
        return result

    image = Image.new("RGB", tuple(value * scale for value in SIZE), color("bg"))
    draw = ImageDraw.Draw(image)

    def rect(bounds, radius, fill, outline=None):
        draw.rounded_rectangle(
            tuple(value * scale for value in bounds), radius=radius * scale,
            fill=color(fill), outline=color(outline) if outline else None, width=scale,
        )

    def text(position, value, size, tone="fg", weight="Regular", anchor="lt"):
        draw.text(tuple(value * scale for value in position), value, font=font(size, weight),
                  fill=color(tone), anchor=anchor)

    def line(points, tone="fg-3", width=2):
        draw.line([(x * scale, y * scale) for x, y in points],
                  fill=color(tone), width=width * scale, joint="curve")

    text((40, 34), "Planche", 30, weight="Semibold")
    text((40, 80), "Your first move.", 15, "fg-2")
    rect((594, 42, 680, 68), 13, "column", "bg-sunken")
    text((637, 55), "INSTALL", 10, "fg-2", "Semibold", "mm")

    for left, title, hint in [(40, "Todo", "Ready to install"), (400, "Done", "Ready to use")]:
        rect((left, 136, left + 280, 384), 12, "column", "bg-sunken")
        text((left + 40, 165), title, 14, weight="Semibold", anchor="lm")
        text((left + 20, 188), hint, 11, "fg-3", anchor="lm")
        rect((left + 20, 208, left + 260, 356), 8, "card", "bg-sunken")

    draw.ellipse((60 * scale, 159 * scale, 72 * scale, 171 * scale),
                 outline=color("fg-3"), width=2 * scale)
    draw.ellipse((419 * scale, 158 * scale, 433 * scale, 172 * scale), fill=color("fg"))
    line([(422, 165), (425, 168), (430, 162)], "card")
    line([(339, 268), (381, 268)])
    line([(372, 259), (381, 268), (372, 277)])

    text((360, 418), "Drag Planche into Applications.", 15, weight="Semibold", anchor="mm")
    text((360, 444), "Then open Planche from Applications.", 12, "fg-2", anchor="mm")
    image.save(path)
    return image


def verify(output):
    with tempfile.TemporaryDirectory(prefix="planche-dmg-check-") as mount:
        subprocess.run(["/usr/bin/hdiutil", "attach", "-readonly", "-nobrowse",
                        "-mountpoint", mount, str(output)], check=True, stdout=subprocess.DEVNULL)
        try:
            volume = Path(mount)
            assert (volume / "Applications").is_symlink()
            assert (volume / "Applications").readlink() == Path("/Applications")
            assert (volume / ".background.tiff").is_file()
            with DSStore.open(str(volume / ".DS_Store"), "r") as store:
                for name, position in ICONS.items():
                    assert store[name]["Iloc"] == position
                view = store["."]["icvp"]
                assert view["iconSize"] == ICON_SIZE
                assert view["backgroundType"] == 2
                alias = Alias.from_bytes(view["backgroundImageAlias"])
                assert alias.target.filename == ".background.tiff"
                window = store["."]["bwsp"]
                assert not window["ShowToolbar"] and not window["ShowSidebar"]
                assert window["WindowBounds"] == "{{160, 120}, {720, 480}}"
            subprocess.run(["/usr/bin/codesign", "--verify", "--deep", "--strict",
                            str(volume / "Planche.app")], check=True)
        finally:
            subprocess.run(["/usr/bin/hdiutil", "detach", mount], check=True,
                           stdout=subprocess.DEVNULL)


def build(app, output):
    app, output = app.resolve(), output.resolve()
    with (app / "Contents/Info.plist").open("rb") as file:
        info = plistlib.load(file)
    assert app.name == "Planche.app" and info["CFBundleIdentifier"] == "dev.planche.app"
    bundled_icon = app / "Contents/Resources" / info["CFBundleIconFile"]
    assert bundled_icon.read_bytes() == (ROOT / "app/src-tauri/icons/icon.icns").read_bytes(), \
        "The app bundle has stale icons; rebuild Planche.app before packaging."
    assert output.suffix == ".dmg"
    output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="planche-dmg-art-") as temporary:
        artwork = Path(temporary)
        background(artwork / "background.png", 1)
        preview = background(artwork / "background@2x.png", 2).convert("RGBA")
        subprocess.run(["/usr/bin/tiffutil", "-cathidpicheck", str(artwork / "background.png"),
                        str(artwork / "background@2x.png"), "-out",
                        str(artwork / "background.tiff")], check=True)

        for name, icon in [
            ("Planche.app", app / "Contents/Resources" / info["CFBundleIconFile"]),
            ("Applications", Path("/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/ApplicationsFolderIcon.icns")),
        ]:
            image = Image.open(icon).convert("RGBA").resize((ICON_SIZE * 2, ICON_SIZE * 2), Image.Resampling.LANCZOS)
            x, y = ICONS[name]
            preview.alpha_composite(image, (x * 2 - ICON_SIZE, y * 2 - ICON_SIZE))
            font = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", 24)
            font.set_variation_by_name("Regular")
            ImageDraw.Draw(preview).text((x * 2, (y + 64) * 2), name.removesuffix(".app"),
                                        font=font, fill=color("fg"), anchor="mm")
        preview.save(output.with_suffix(".png"))

        dmgbuild.build_dmg(str(output), "Planche", settings={
            "format": "UDZO", "filesystem": "APFS", "files": [str(app)],
            "symlinks": {"Applications": "/Applications"},
            "background": str(artwork / "background.tiff"), "icon_locations": ICONS,
            "window_rect": ((160, 120), SIZE), "default_view": "icon-view",
            "show_toolbar": False, "show_sidebar": False, "show_status_bar": False,
            "show_pathbar": False, "show_tab_view": False, "arrange_by": None,
            "icon_size": ICON_SIZE, "text_size": 12,
        })

    subprocess.run(["/usr/bin/hdiutil", "verify", str(output)], check=True)
    verify(output)
    print(f"DMG and Finder layout verified: {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build Planche's Todo → Done installer")
    parser.add_argument("app", type=Path)
    parser.add_argument("output", type=Path)
    arguments = parser.parse_args()
    build(arguments.app, arguments.output)
