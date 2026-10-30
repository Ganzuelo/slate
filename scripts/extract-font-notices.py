"""Refresh notices from the pinned font binaries (requires fonttools and brotli)."""
from pathlib import Path
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
fonts = root / 'node_modules/@excalidraw/excalidraw/dist/prod/fonts'
notices = []
for directory in sorted(fonts.iterdir()):
    if not directory.is_dir():
        continue
    font = TTFont(next(directory.glob('*.woff2')))
    values = dict.fromkeys(record.toUnicode() for record in font['name'].names if record.nameID in [0, 7, 8, 9, 13, 14])
    notices.append('Font: ' + directory.name + '\n' + '\n'.join(values))
(root / 'scripts/licenses/FONTS.txt').write_text('\n\n---\n\n'.join(notices), encoding='utf-8')
