"""Build the macOS icon from the current desktop artwork with optical padding.

The other platforms retain their existing artwork and sizes. icon_source.png is
a legacy design and must not be used as the source for current desktop icons.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def main():
    artwork = Image.open(ROOT / 'src-tauri/icons/icon.png').convert('RGBA')
    canvas = Image.new('RGBA', (1024, 1024))
    canvas.alpha_composite(artwork.resize((824, 824), Image.Resampling.LANCZOS), (100, 100))
    canvas.save(ROOT / 'src-tauri/icons/icon.icns', format='ICNS')


if __name__ == '__main__':
    main()
