# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller 打包配置文件
用于将 Python 推理服务打包为独立可执行文件
"""

import sys
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# 隐藏导入（PyInstaller 可能检测不到的模块）
hiddenimports = [
    'transformers',
    'transformers.models.bert',
    'torch',
    'torch.nn',
    'flask',
    'flask_cors',
    'pypinyin',
    'jieba',
    'safetensors',
    'safetensors.torch',
    'tokenizers',
    'tokenizers.models',
    'tokenizers.decoders',
    'tokenizers.normalizers',
    'tokenizers.pre_tokenizers',
    'tokenizers.processors',
    'tokenizers.trainers',
    'numpy',
    'numpy.core',
    'numpy.core._methods',
]

# 排除训练/可视化专用库（app.py 和 config_manager.py 未使用，不影响推理功能）
excludes = [
    'matplotlib', 'seaborn', 'tensorboard',
    'datasets', 'peft', 'evaluate', 'accelerate',
    'IPython', 'notebook', 'jupyter', 'tkinter',
    'unittest', 'test', 'tests',
    'scipy', 'pandas', 'tqdm',
    'sklearn', 'scikit-learn',
]

a = Analysis(
    ['app.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='app',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # 保留控制台窗口以查看日志
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='app',
)
