# -*- mode: python ; coding: utf-8 -*-
import sys
import os

block_cipher = None

# Dependiendo del OS, el separador de paths cambia
sep = os.pathsep

a = Analysis(
    ['run_agent.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('agent', 'agent'),
        ('tools', 'tools'),
        ('omniworker_cli', 'omniworker_cli'),
        ('gateway', 'gateway')
    ],
    hiddenimports=[
        'httpx',
        'rich',
        'tenacity',
        'yaml',
        'ruamel.yaml',
        'requests',
        'pydantic',
        'croniter',
        'jwt',
        'psutil',
        'intent_classifier'
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='omniworker-engine',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
