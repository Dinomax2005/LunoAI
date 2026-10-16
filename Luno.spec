# PyInstaller onedir GUI. ML frameworks are installed later into the per-user venv.
import sys
from pathlib import Path

source_files = [(str(path), 'bundle/luno_desktop') for path in Path('luno_desktop').glob('*.py')]
icon = ('assets/luno.ico' if sys.platform == 'win32' else
        'assets/luno.icns' if sys.platform == 'darwin' else None)

a = Analysis(
    ['luno_desktop/__main__.py'],
    pathex=[str(Path.cwd())],
    binaries=[],
    datas=[('assets/logo.png', 'assets'), ('pyproject.toml', 'bundle'), *source_files],
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    excludes=['torch', 'transformers', 'peft', 'datasets', 'accelerate', 'llama_cpp'],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [], exclude_binaries=True, name='Luno',
    debug=False, bootloader_ignore_signals=False, strip=False, upx=False,
    console=False, icon=icon,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='Luno')
if sys.platform == 'darwin':
    app = BUNDLE(coll, name='Luno.app', icon='assets/luno.icns',
                 bundle_identifier='ai.luno.desktop', info_plist={'NSHighResolutionCapable': True})
