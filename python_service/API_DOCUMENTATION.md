# BERT 缩写识别服务 API 文档

## 基础信息

- **服务地址**: `http://localhost:5000`
- **协议**: HTTP/1.1
- **编码**: UTF-8
- **CORS**: 已启用，支持跨域请求

## 接口列表

### 1. 健康检查

检查服务状态和模型加载情况。

**请求**
```
GET /health
```

**响应**
```json
{
    "status": "ok",
    "model_loaded": true,
    "version": "1.0.0"
}
```

**字段说明**
| 字段 | 类型 | 说明 |
|------|------|------|
| status | string | 服务状态，"ok" 表示正常 |
| model_loaded | boolean | 模型是否已加载 |
| version | string | API 版本号 |

---

### 2. 流式预测（推荐）

逐个预测缩写，通过 SSE (Server-Sent Events) 流式返回结果，支持实时进度跟踪。

**请求**
```
POST /predict_stream
Content-Type: application/json

{
    "data": ["bsm", "xzqdm", "mj"],
    "k": 5
}
```

**参数说明**
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| data | array | 是 | - | 缩写列表，每个元素为一个待识别的缩写字符串 |
| k | int | 否 | 5 | 每个缩写返回的候选数量 |

**响应（SSE 流）**
```
event: progress
data: {"index": 0, "total": 3, "abbr": "bsm", "result": {"content": "标识码", "confidence": 0.9234, "alternatives": [...]}, "progress": 33.33}

event: progress
data: {"index": 1, "total": 3, "abbr": "xzqdm", "result": {"content": "行政区代码", "confidence": 0.8912, "alternatives": [...]}, "progress": 66.67}

event: progress
data: {"index": 2, "total": 3, "abbr": "mj", "result": {"content": "面积", "confidence": 0.9456, "alternatives": [...]}, "progress": 100.0}

event: complete
data: {"success": true, "count": 3}
```

**SSE 事件说明**
| 事件 | 说明 |
|------|------|
| progress | 单个缩写预测完成，返回结果和进度 |
| complete | 所有缩写预测完成 |

**progress 事件数据字段**
| 字段 | 类型 | 说明 |
|------|------|------|
| index | int | 当前处理序号（从 0 开始） |
| total | int | 总数 |
| abbr | string | 输入的缩写 |
| result | object | 识别结果 |
| result.content | string | 识别的全称（置信度最高） |
| result.confidence | float | 置信度（0-1） |
| result.alternatives | array | 候选列表，每个元素包含 content 和 confidence |
| progress | float | 进度百分比（0-100） |

**complete 事件数据字段**
| 字段 | 类型 | 说明 |
|------|------|------|
| success | boolean | 是否成功 |
| count | int | 处理的总数 |

---

### 3. 普通预测

批量预测，一次性返回所有结果（非流式）。

**请求**
```
POST /predict
Content-Type: application/json

{
    "data": ["bsm", "xzqdm"],
    "k": 5
}
```

**参数说明**
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| data | array | 是 | - | 缩写列表 |
| k | int | 否 | 5 | 每个缩写返回的候选数量 |

**响应**
```json
{
    "success": true,
    "count": 2,
    "results": [
        {
            "content": "标识码",
            "confidence": 0.9234,
            "alternatives": [
                {"content": "标识码", "confidence": 0.9234},
                {"content": "标准码", "confidence": 0.0456},
                {"content": "标识名称", "confidence": 0.0210}
            ]
        },
        {
            "content": "行政区代码",
            "confidence": 0.8912,
            "alternatives": [
                {"content": "行政区代码", "confidence": 0.8912},
                {"content": "行政代码", "confidence": 0.0789}
            ]
        }
    ]
}
```

**字段说明**
| 字段 | 类型 | 说明 |
|------|------|------|
| success | boolean | 是否成功 |
| count | int | 结果数量 |
| results | array | 识别结果列表 |
| results[].content | string | 识别的全称 |
| results[].confidence | float | 置信度 |
| results[].alternatives | array | 候选列表 |

---

### 4. 批量预测

处理大量数据，分批处理避免内存溢出。

**请求**
```
POST /batch_predict
Content-Type: application/json

{
    "data": ["bsm", "xzqdm", "mj", "tb", ...],
    "batch_size": 100,
    "k": 5
}
```

**参数说明**
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| data | array | 是 | - | 缩写列表 |
| batch_size | int | 否 | 100 | 每批处理的数量 |
| k | int | 否 | 5 | 每个缩写返回的候选数量 |

**响应**
与普通预测接口相同。

---

## 前端调用示例

### JavaScript (Fetch + ReadableStream)

```javascript
async function predictStream(abbrs, onProgress) {
    const response = await fetch('http://localhost:5000/predict_stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: abbrs, k: 5 })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // 保留不完整的行

        for (const line of lines) {
            if (line.startsWith('event: ')) {
                const event = line.slice(7);
                // 读取下一行的 data
                const dataLine = lines[lines.indexOf(line) + 1];
                if (dataLine && dataLine.startsWith('data: ')) {
                    const data = JSON.parse(dataLine.slice(6));
                    
                    if (event === 'progress') {
                        console.log(`进度: ${data.progress}%`, data);
                        onProgress && onProgress(data);
                    } else if (event === 'complete') {
                        console.log('处理完成', data);
                    }
                }
            }
        }
    }
}

// 使用示例
const abbrs = ['bsm', 'xzqdm', 'mj', 'tb', 'ghzt'];
predictStream(abbrs, (data) => {
    // 更新进度条
    updateProgressBar(data.progress);
    // 显示当前结果
    displayResult(data.index, data.result);
});
```

### Python 调用示例

```python
import requests
import json

# 普通预测
response = requests.post('http://localhost:5000/predict', json={
    'data': ['bsm', 'xzqdm'],
    'k': 5
})
results = response.json()
print(results)

# 流式预测
response = requests.post('http://localhost:5000/predict_stream', json={
    'data': ['bsm', 'xzqdm', 'mj'],
    'k': 5
}, stream=True)

for line in response.iter_lines():
    if line:
        line = line.decode('utf-8')
        if line.startswith('data: '):
            data = json.loads(line[6:])
            print(f"进度: {data.get('progress', 0)}%", data)
```

### cURL 调用示例

```bash
# 健康检查
curl http://localhost:5000/health

# 普通预测
curl -X POST http://localhost:5000/predict \
  -H "Content-Type: application/json" \
  -d '{"data": ["bsm", "xzqdm"], "k": 5}'

# 流式预测
curl -X POST http://localhost:5000/predict_stream \
  -H "Content-Type: application/json" \
  -d '{"data": ["bsm", "xzqdm", "mj"], "k": 5}'
```

---

## 错误处理

### 错误响应格式
```json
{
    "error": "错误描述信息"
}
```

### HTTP 状态码
| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误（如缺少 data 字段、data 不是数组等） |
| 500 | 服务器内部错误（如模型加载失败、推理异常等） |

### 常见错误
| 错误信息 | 说明 | 解决方法 |
|----------|------|----------|
| 缺少 data 字段 | 请求体中没有 data 字段 | 检查请求体格式 |
| data 必须是数组 | data 字段不是数组类型 | 确保 data 是数组 |
| data 不能为空 | data 数组为空 | 确保至少有一个缩写 |
| 模型路径不存在 | 模型文件未找到 | 检查 models/abbr_mapper_nar 目录 |

---

## 模型信息

- **架构**: BertForTokenClassification
- **任务**: 缩写识别（将缩写映射为全称）
- **特殊 Token**: `<ABBR>`, `</ABBR>`
- **最大输入长度**: 32
- **模型路径**: `models/abbr_mapper_nar/`

## 启动服务

```bash
# 安装依赖
pip install -r requirements.txt

# 启动服务
python python_service/app.py

# 服务启动后会自动加载模型，然后监听 5000 端口
```

## 注意事项

1. **模型常驻内存**: 服务启动时会自动加载模型，保持常驻内存直到程序关闭
2. **GPU 支持**: 如果系统有 CUDA 支持的 GPU，会自动使用 GPU 进行推理
3. **流式输出**: 推荐在需要实时进度反馈的场景使用 `/predict_stream` 接口
4. **批量处理**: 大量数据建议使用 `/batch_predict` 接口，避免内存溢出
