#!/bin/sh
# Run once on macOS: renames -2x/-3x to @2x/@3x (Apple convention) and builds AppIcon.icns.
set -e
cd "$(dirname "$0")"
for f in AppIcon.iconset/*-2x.png AppIcon.appiconset/*-2x.png ../menubar/*-2x.png; do [ -e "$f" ] && mv "$f" "${f%-2x.png}@2x.png"; done
for f in ../menubar/*-3x.png; do [ -e "$f" ] && mv "$f" "${f%-3x.png}@3x.png"; done
sed -i '' 's/-2x\.png/@2x.png/g' AppIcon.appiconset/Contents.json
iconutil -c icns AppIcon.iconset -o AppIcon.icns && echo "OK: AppIcon.icns"
