# 数据标注工具 v1.0

基于 Electron + TypeScript + React 的桌面数据标注工具，支持 Excel 上传、BERT 模型推理、结果反馈收集。

## 功能特性

- ✅ Excel 文件上传（.xlsx / .xls）
- ✅ 表格数据展示，支持列选中
- ✅ BERT 微调模型推理（支持模拟/真实模型）
- ✅ 推理结果展示（内容 + 置信度可视化）
- ✅ 用户反馈收集（确认/标记错误/修正值）
- ✅ 反馈数据本地存储（SQLite）
- ✅ 数据导出（JSON/CSV，用于模型再训练）
- ✅ 反馈统计面板
- ✅ Windows 安装程序打包（NSIS）

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 29 + TypeScript |
| 前端 UI | React 18 + Tailwind CSS |
| 数据存储 | better-sqlite3（本地 SQLite） |
| Excel 解析 | xlsx (SheetJS) |
| 推理服务 | Python + Flask + BERT |
| 打包工具 | electron-builder |

## 目录结构

```
data-label-tool/
├── electron/              # Electron 主进程
│   ├── main.ts           # 主进程入口
│   └── preload.ts        # 安全 IPC 桥接
├── src/                   # 渲染进程（React）
│   ├── components/       # UI 组件
│   ├── App.tsx           # 主应用组件
│   ├── main.tsx          # React 入口
│   └── index.css         # 全局样式
├── python_service/        # Python 推理服务
│   ├── app.py            # Flask API 服务
│   └── requirements.txt  # Python 依赖
├── build/                 # 图标文件
├── package.json           # 项目配置
├── vite.config.ts         # Vite 配置
└── README.md              # 本文件
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

### 可选环境（用于打包）

- **Git** - 用于克隆代码

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
- Python 推理服务（自动启动）

### 5. 生产模式打包

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

1. **上传文件**: 点击"上传 Excel 文件"按钮，选择 .xlsx 或 .xls 文件
2. **选择列**: 点击表格列标题（表头），选中要进行推理的列
3. **等待推理**: 系统自动调用 BERT 模型进行推理
4. **查看结果**: 右侧面板显示推理结果和置信度
5. **反馈确认**:
   - 点击 ✓ 确认结果正确
   - 点击 ✗ 标记结果错误
   - 在输入框中输入修正值，点击"提交修正"
6. **导出数据**: 点击"导出数据"按钮，将反馈数据导出为 JSON/CSV

### 界面说明

| 区域 | 功能 |
|------|------|
| 顶部导航栏 | 上传按钮、统计按钮、导出按钮 |
| 左侧表格区 | Excel 数据展示，点击列头选中 |
| 右侧结果区 | 推理结果、置信度条、反馈操作 |
| 统计面板 | 总反馈数、确认数、错误数、确认率 |

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl + O | 上传文件 |
| Ctrl + E | 导出数据 |
| F5 | 刷新统计 |

## Python 模型配置

### 使用模拟模型（默认）

项目默认包含一个 MockBERTModel，用于开发和测试，无需额外配置即可运行。

### 接入真实 BERT 模型

编辑 `python_service/app.py`，替换 `MockBERTModel` 类:

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

class RealBERTModel:
    def __init__(self, model_path='./your-model'):
        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_path)
        self.model.eval()

    def predict(self, texts):
        results = []
        for text in texts:
            inputs = self.tokenizer(text, return_tensors='pt', 
                                   padding=True, truncation=True, max_length=512)
            with torch.no_grad():
                outputs = self.model(**inputs)
                predictions = torch.softmax(outputs.logits, dim=-1)

            confidence = predictions.max().item()
            predicted_class = predictions.argmax().item()

            results.append({
                "content": f"类别 {predicted_class}",
                "confidence": confidence,
                "alternatives": []
            })
        return results
```

## 数据存储说明

### 数据库位置

- **开发模式**: `data-label-tool/feedback.db`
- **生产模式**: `%APPDATA%/data-label-tool/feedback.db` (Windows)

### 表结构

```sql
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  input_text TEXT NOT NULL,        -- 原始输入
  model_output TEXT,               -- 模型输出
  confidence REAL,                 -- 置信度
  user_confirm INTEGER,            -- 用户确认(1=正确,0=错误)
  corrected_value TEXT,            -- 用户修正值
  column_name TEXT,                -- 列名
  file_name TEXT,                  -- 文件名
  created_at DATETIME              -- 创建时间
);
```

### 导出数据格式

**JSON 示例**:
```json
[
  {
    "id": 1,
    "input_text": "原始文本",
    "model_output": "识别结果",
    "confidence": 0.85,
    "user_confirm": 1,
    "corrected_value": null,
    "column_name": "产品名称",
    "file_name": "data.xlsx",
    "created_at": "2026-05-21 10:30:00"
  }
]
```

## Windows 打包详细说明

### 打包配置

`package.json` 中的 `build` 字段配置了:

- **应用 ID**: `com.yourcompany.data-label-tool`
- **产品名称**: `数据标注工具`
- **安装程序**: NSIS（支持自定义安装路径）
- **快捷方式**: 桌面 + 开始菜单

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

**原因**: Python 环境未配置或依赖未安装

**解决**:
```bash
# 检查 Python
python --version

# 安装依赖
cd python_service
pip install -r requirements.txt
```

### Q2: 打包后 Python 服务无法启动

**原因**: 生产环境 Python 路径问题

**解决**: 确保目标机器已安装 Python，或在打包时将 Python 环境一并打包（使用 PyInstaller）。

### Q3: Excel 文件读取失败

**原因**: 文件格式不支持或文件损坏

**解决**: 确保文件为 .xlsx 或 .xls 格式，且未被其他程序占用。

### Q4: 置信度显示为模拟数据

**原因**: Python 服务未连接，使用前端模拟数据

**解决**: 检查 Python 服务是否正常运行，查看控制台日志。

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
