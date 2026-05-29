# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller 打包配置文件
用于将 Python 推理服务打包为独立可执行文件
"""

import sys
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# 隐藏导入（PyInstaller 可能检测不到的模块）
# 注意：torch、transformers 等大依赖由客户端自行安装，不打包进可执行文件
hiddenimports = [
    'flask',
    'flask_cors',
    'waitress',
    'pypinyin',
    'jieba',
    'numpy',
    'numpy.core',
    'numpy.core._methods',
]

# 排除大体积依赖（由客户端自行安装）和训练/可视化专用库
excludes = [
    'torch', 'torchvision', 'torchaudio',
    'transformers', 'tokenizers', 'safetensors',
    'huggingface_hub', 'huggingface',
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
    upx=False,
    console=True,  # 保留控制台窗口以查看日志
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='app',
)
