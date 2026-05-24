# 数据标注工具 v1.0

基于 Electron + TypeScript + React 的桌面数据标注工具，支持 Excel 多标签编辑、NAR 缩写识别模型推理、流式预测、结果回填与反馈收集。

## 功能特性

### Excel 数据处理
- ✅ 多标签页编辑（最多同时打开 5 个文件）
- ✅ 多 Sheet 切换（支持 .xlsx / .xls 文件内多个 Sheet）
- ✅ 单元格直接编辑，支持保存/另存为
- ✅ 左侧文件浏览器，目录树展示，快速定位 xlsx 文件
- ✅ 可折叠/可拖拽调整宽度的侧边栏

### 缩写识别预测
- ✅ 流式预测（SSE 实时推送进度）
- ✅ 底部进度条实时显示预测进度
- ✅ 右侧面板展示预测结果（源字段、预测全称、置信度、备选结果）
- ✅ 支持单个/批量应用预测结果，自动回填到 Excel 表格
- ✅ 预测数据本地缓存，关闭标签后自动恢复

### 反馈系统
- ✅ 对预测结果进行反馈（确认正确、标记错误、提交修正值）
- ✅ 反馈后自动更新预测面板，置信度置为 100%
- ✅ 菜单栏导出反馈报告为 Excel 文件

### 配置系统
- ✅ GPU 设置：计算设备选择（自动检测 / CPU / CUDA）、CUDA 可见设备指定
- ✅ 过滤规则：精确匹配替换、前缀匹配跳过模型识别
- ✅ 配置保存后即时或重启生效

### 数据安全
- ✅ 数据库加密（SQLCipher），保护本地数据安全
- ✅ 调试模式下支持解密导出数据库

### 打包部署
- ✅ Windows 安装程序打包（NSIS）
- ✅ Python 推理服务 PyInstaller 打包集成

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 41 + TypeScript |
| 前端 UI | React 18 + Tailwind CSS |
| 数据存储 | better-sqlite3 + SQLCipher（加密） |
| Excel 解析 | xlsx (@e965/xlsx) |
| 推理服务 | Python + Flask + NAR 缩写识别模型 + 过滤规则引擎 |
| Python 打包 | PyInstaller |
| 打包工具 | electron-builder |

## 目录结构

```
data-label-tool/
├── electron/                  # Electron 主进程
│   ├── main.ts                # 主进程入口（IPC、数据库、菜单、Python 服务管理）
│   ├── preload.ts             # 安全 IPC 桥接
│   ├── db-encryption.ts       # 数据库加密（SQLCipher）
│   └── secure-key-manager.ts  # 密钥管理
├── src/                       # 渲染进程（React）
│   ├── components/            # UI 组件
│   │   ├── DataTable.tsx          # Excel 数据表格
│   │   ├── ExcelTabs.tsx          # 多标签页管理
│   │   ├── FileExplorer.tsx       # 左侧文件浏览器
│   │   ├── PredictionPanel.tsx    # 预测结果面板（滑出式）
│   │   ├── FeedbackModal.tsx      # 反馈弹窗
│   │   ├── SettingsModal.tsx      # 全局设置面板
│   │   ├── ProgressBar.tsx        # 预测进度条
│   │   ├── ResizableDivider.tsx   # 可拖拽分隔条
│   │   ├── CloseTabConfirmDialog.tsx  # 关闭确认对话框
│   │   ├── StatsPanel.tsx         # 统计面板
│   │   ├── ResultPanel.tsx        # 结果面板
│   │   └── ErrorBoundary.tsx      # 错误边界
│   ├── utils/
│   │   └── predictionStorage.ts   # 预测数据本地存储（localStorage）
│   ├── types/
│   │   └── electron.d.ts          # Electron API 类型定义
│   ├── App.tsx                # 主应用组件
│   ├── main.tsx               # React 入口
│   └── index.css              # 全局样式
├── python_service/            # Python 推理服务
│   ├── app.py                 # Flask API 服务（NAR 模型、过滤规则）
│   ├── text_filter.py         # 文本过滤规则引擎
│   ├── config_manager.py      # 配置管理器
│   ├── text_preprocessor.py   # 文本预处理
│   ├── requirements.txt       # Python 依赖
│   └── data-label-tool.spec   # PyInstaller 打包配置
├── config/                    # 配置文件
│   ├── gpu_config.json        # GPU 配置
│   └── filter_config.json     # 过滤规则配置
├── scripts/                   # 构建脚本
│   └── build-win.js           # Windows 打包脚本
├── build/                     # 图标文件
├── package.json               # 项目配置
├── vite.config.ts             # Vite 配置
├── tailwind.config.js         # Tailwind CSS 配置
├── tsconfig.json              # TypeScript 配置
├── start.bat / start.ps1      # 启动脚本
├── build.bat                  # 构建脚本
└── README.md                  # 本文件
```

## 环境要求

### 必需环境

1. **Node.js** >= 18.0.0
   - 下载: https://nodejs.org/
   - 验证: `node -v`

2. **Python** 3.8 - 3.11（推荐 3.10）
   - 下载: https://www.python.org/downloads/
   - 验证: `python --version` (Windows) 或 `python3 --version` (Mac/Linux)
   - **重要**: 安装时勾选 "Add Python to PATH"
   - **注意**: Python 3.12 暂不支持 PyTorch 2.0，请勿使用

3. **npm** >= 9.0.0（随 Node.js 安装）
   - 验证: `npm -v`

### 可选环境

- **Git** - 用于克隆代码
- **CUDA** - 用于 GPU 加速模型推理（推荐 CUDA 11.8 或更高）
- **PyInstaller** - 用于打包 Python 推理服务
  ```bash
  pip install pyinstaller
  ```

## 快速开始

### 1. 克隆/下载代码

```bash
# 使用 Git
git clone <仓库地址>
cd data-label-tool

# 或直接解压 zip 文件后进入目录
```

### 2. 安装前端依赖

```bash
npm install
```

### 3. 安装 Python 依赖

```bash
cd python_service

# Windows
pip install -r requirements.txt

# Mac/Linux
pip3 install -r requirements.txt

cd ..
```

### 4. 开发模式运行

```bash
# 同时启动前端和 Electron
npm run dev
```

这将启动:
- Vite 开发服务器（前端热更新）
- Electron 窗口（桌面应用）
- Python 推理服务（自动启动，加载 NAR 模型）

启动后界面:
- 左侧为文件浏览器，点击 "打开文件夹" 或按 `Ctrl+O` 选择包含 xlsx 文件的目录
- 中间为 Excel 数据展示区，支持多标签页、多 Sheet 切换、单元格编辑
- 右侧为预测结果面板（预测后自动滑出）

### 5. 生产模式打包

#### 打包 Python 推理服务（必需）

在使用 electron-builder 打包前，必须先将 Python 服务打包为可执行文件：

```bash
cd python_service
pyinstaller data-label-tool.spec
cd ..
```

打包后的 Python 服务将输出到 `python_dist/app/` 目录。

#### Windows 安装程序（.exe）

```bash
npm run build:win
```

输出位置: `release/数据标注工具 Setup 1.0.0.exe`

#### macOS (DMG)

```bash
npm run build:mac
```

#### Linux (AppImage)

```bash
npm run build:linux
```

## 使用指南

### 基本操作流程

1. **打开文件夹**: 点击菜单栏 "文件" → "打开文件夹" 或按 `Ctrl+O`，选择包含 xlsx 文件的目录
2. **选择文件**: 在左侧文件浏览器中点击 xlsx 文件，文件将在中间表格区打开（最多同时打开 5 个文件）
3. **选择列**: 点击表格列标题（表头），选中要进行预测的列
4. **等待预测**: 系统自动调用 NAR 模型进行流式预测，底部显示实时进度条
5. **查看结果**: 右侧面板显示预测结果（源字段、预测全称、置信度、备选结果列表）
6. **反馈确认**:
   - 点击反馈按钮（拇指向下图标）标记结果错误
   - 在弹窗中输入修正值，点击"提交"
   - 若预测正确，可直接应用结果
7. **应用结果**: 点击单个结果的箭头按钮应用，或点击"全部应用"批量回填到 Excel 表格
8. **保存文件**: 按 `Ctrl+S` 直接保存，或点击"另存为"选择新路径
9. **导出反馈报告**: 菜单栏 "导出" → "反馈报告"，将反馈数据导出为 Excel 文件

### 界面说明

| 区域 | 功能 |
|------|------|
| 顶部菜单栏 | 文件（打开文件夹、退出）、导出（反馈报告）、设置（全局设置） |
| 左侧文件浏览器 | 目录树展示，xlsx 文件高亮，可折叠/拖拽调整宽度 |
| 中间表格区 | Excel 数据展示，多标签页、多 Sheet 切换，单元格编辑 |
| 右侧面板 | 预测结果、置信度条、备选结果、反馈操作、应用按钮 |
| 底部进度条 | 流式预测实时进度，支持取消 |

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl + O | 打开文件夹 |
| Ctrl + S | 保存文件 |
| Esc | 关闭弹窗 |

## 配置说明

### GPU 配置

通过菜单栏 "设置" → "全局设置" → "GPU 设置" 进行配置：

- **计算设备**: 自动检测 / CPU / CUDA (GPU)
  - 自动检测：优先使用 GPU，不可用时回退到 CPU
  - CPU：强制使用 CPU 推理
  - CUDA：强制使用 GPU 推理
- **CUDA 可见设备**: 指定可见的 GPU 设备编号，如 `0` 或 `0,1`（多卡时用逗号分隔）

**注意**: GPU 配置修改后需要重启应用才能生效。

### 过滤规则配置

通过菜单栏 "设置" → "全局设置" → "过滤规则" 进行配置：

- **精确匹配规则**: 配置 "缩写 → 全称" 的映射，匹配成功后直接返回替换值，置信度 100%，不经过模型推理
- **前缀匹配规则**: 配置前缀（如 `SHAPE`、`GEOM`），匹配成功的文本直接返回原值，不进行模型识别

**注意**: 过滤规则保存后立即生效，无需重启应用。

## Python 模型配置

### 模型架构

本项目使用 **NAR（Non-Autoregressive）缩写识别模型**，基于 BERT 的 token 分类实现，专门用于将缩写（如 `CPU`）识别为全称（如 `中央处理器`）。

模型推理优先级：
1. **前缀匹配**: 匹配前缀规则 → 直接返回原值
2. **精确匹配**: 匹配精确规则 → 返回替换值（置信度 100%）
3. **NAR 模型推理**: 无规则匹配 → 调用模型进行非自回归 top-k 推理

### 模型加载流程

1. 读取 `config/gpu_config.json` 获取 GPU 配置
2. 应用 `CUDA_VISIBLE_DEVICES` 环境变量
3. 根据配置或自动检测选择计算设备（CPU / CUDA）
4. 加载 BERT tokenizer 和 `BertForTokenClassification` 模型
5. 将模型移至目标设备并验证 GPU 使用情况

### 接入自定义模型

将训练好的 NAR 模型文件夹放置到 `models/abbr_mapper_nar/` 目录下，确保包含：
- `config.json`
- `pytorch_model.bin`
- `vocab.txt`

模型文件夹结构示例：
```
models/
└── abbr_mapper_nar/
    ├── config.json
    ├── pytorch_model.bin
    └── vocab.txt
```

## 数据存储说明

### 数据库位置

- **开发模式**: `%APPDATA%/data-label-tool/data/`
- **生产模式**: `%APPDATA%/data-label-tool/data/` (Windows)

具体文件：
- `feedback.db` - 旧版反馈数据（兼容保留）
- `predictions.db` - 预测记录数据
- `feedback.db`（在 `data/` 目录下）- 新版反馈记录数据

### 数据库加密

所有数据库使用 **SQLCipher** 进行加密保护：
- 首次启动时自动创建加密数据库
- 若检测到旧版本明文数据库，自动迁移到加密数据库
- 调试模式下可通过 IPC 接口解密导出数据库

### 表结构

#### prediction_records（预测记录）

```sql
CREATE TABLE prediction_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,           -- 批次ID
  source_field TEXT NOT NULL,       -- 源字段（缩写）
  predicted_result TEXT,            -- 预测结果（全称）
  user_selected_result TEXT,        -- 用户选择的结果
  confidence REAL,                  -- 置信度
  column_name TEXT,                 -- 列名
  file_name TEXT,                   -- 文件名
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### feedback_records（反馈记录）

```sql
CREATE TABLE feedback_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prediction_id INTEGER,            -- 关联的预测记录ID
  batch_id TEXT NOT NULL,           -- 批次ID
  source_field TEXT NOT NULL,       -- 源字段
  predicted_result TEXT,            -- 预测结果
  actual_content TEXT,              -- 实际内容（用户确认的正确内容）
  is_correct INTEGER DEFAULT 0,     -- 预测是否正确 (1=正确, 0=错误)
  file_name TEXT,                   -- 文件名
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### feedback（旧版反馈表，兼容保留）

```sql
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  input_text TEXT NOT NULL,         -- 原始输入
  model_output TEXT,                -- 模型输出
  confidence REAL,                  -- 置信度
  user_confirm INTEGER DEFAULT 0,   -- 用户确认 (1=正确, 0=错误)
  corrected_value TEXT,             -- 用户修正值
  column_name TEXT,                 -- 列名
  file_name TEXT,                   -- 文件名
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 导出数据格式

**反馈报告 Excel 示例**:

| 序号 | 导出源字段 | 预测值 | 实际值 | 时间 |
|------|-----------|--------|--------|------|
| 1 | CPU | 中央处理器 | 中央处理器 | 2026-05-21 10:30:00 |
| 2 | GPU | 图形处理器 | 显卡 | 2026-05-21 10:31:00 |

## Windows 打包详细说明

### 打包配置

`package.json` 中的 `build` 字段配置了:

- **应用 ID**: `com.yourcompany.data-label-tool`
- **产品名称**: `数据标注工具`
- **安装程序**: NSIS（支持自定义安装路径）
- **快捷方式**: 桌面 + 开始菜单
- **额外资源**: `python_dist/app`（PyInstaller 打包的 Python 服务）、`config/`（配置文件）

### 打包流程

1. 确保 Python 服务已打包：
   ```bash
   cd python_service
   pyinstaller data-label-tool.spec
   cd ..
   ```

2. 执行 electron-builder 打包：
   ```bash
   npm run build:win
   ```

3. 输出文件：`release/数据标注工具 Setup 1.0.0.exe`

### 安装过程

1. 运行 `release/数据标注工具 Setup 1.0.0.exe`
2. 选择安装语言（中文）
3. 接受许可协议
4. 选择安装路径（默认: `C:\Program Files\数据标注工具`）
5. 选择是否创建桌面快捷方式
6. 等待安装完成
7. 点击"完成"启动应用

### 卸载

- 开始菜单 → 数据标注工具 → 卸载
- 或控制面板 → 程序和功能 → 卸载

## 常见问题

### Q1: 启动时提示 "Python 服务未启动"

**原因**: Python 环境未配置、依赖未安装或 PyInstaller 打包结果缺失

**解决**:
```bash
# 检查 Python
python --version

# 安装依赖
cd python_service
pip install -r requirements.txt

# 生产模式需确保 PyInstaller 打包完成
cd python_service
pyinstaller data-label-tool.spec
```

### Q2: 打包后 Python 服务无法启动

**原因**: 生产环境缺少 PyInstaller 打包的 Python 可执行文件

**解决**:
1. 检查 `python_dist/app/` 目录是否存在
2. 重新执行 PyInstaller 打包：
   ```bash
   cd python_service
   pyinstaller data-label-tool.spec
   ```
3. 检查 `package.json` 中 `extraResources` 配置是否正确包含 `python_dist/app`

### Q3: Excel 文件读取失败

**原因**: 文件格式不支持或文件损坏

**解决**: 确保文件为 .xlsx 或 .xls 格式，且未被其他程序占用。

### Q4: 置信度显示为模拟数据

**原因**: Python 服务未连接，使用前端模拟数据

**解决**: 检查 Python 服务是否正常运行，查看控制台日志。确保模型已正确加载。

### Q5: GPU 未生效，模型仍在 CPU 上运行

**原因**: CUDA 版本不匹配、PyTorch 安装的是 CPU 版本或 GPU 配置错误

**解决**:
1. 检查 CUDA 是否可用：
   ```bash
   python -c "import torch; print(torch.cuda.is_available())"
   ```
2. 检查 PyTorch CUDA 版本：
   ```bash
   python -c "import torch; print(torch.version.cuda)"
   ```
3. 若 CUDA 版本为 None，需重新安装 GPU 版本 PyTorch：
   ```bash
   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
   ```
4. 检查 `config/gpu_config.json` 中 `device` 是否设置为 `cuda`

### Q6: 过滤规则不生效

**原因**: 配置文件路径错误或 Python 服务未重载配置

**解决**:
1. 检查 `config/filter_config.json` 是否存在且格式正确
2. 在设置面板中重新保存过滤规则，系统会自动通知 Python 服务重载
3. 查看 Python 服务日志确认配置重载状态

## 开发指南

### 添加新的 IPC 接口

1. **主进程** (`electron/main.ts`): 添加 `ipcMain.handle('new-channel', ...)`
2. **Preload** (`electron/preload.ts`): 在 `electronAPI` 中添加暴露方法
3. **前端** (`src/`): 通过 `window.electronAPI.newChannel()` 调用

### 修改 UI 样式

- 全局样式: `src/index.css`（Tailwind 自定义类）
- 组件样式: 各组件内联 Tailwind 类
- 主题色: 修改 `tailwind.config.js` 的 `theme.extend`

## 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|---------|
| 1.0.0 | 2026-05 | 初始版本，基础功能完成 |

## 联系方式

如有问题或建议，请联系开发团队。

---

**注意**: 本工具收集的反馈数据仅存储在本地，不会上传到任何服务器。
