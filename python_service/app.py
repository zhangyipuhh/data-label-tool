#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BERT 缩写识别推理服务
提供 HTTP API 供前端调用
模型常驻内存，支持流式输出
"""

import os
import sys
import io
import json
import logging
import itertools
from typing import List, Dict, Any, Tuple, Generator, Optional
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import torch
from transformers import BertTokenizer, BertForTokenClassification

# 导入过滤模块
from text_filter import get_text_filter, FilterResultType

# 设置 stdout/stderr 编码为 utf-8，解决 Windows 终端中文乱码问题
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)


class NARConfig:
    """NAR 模型配置类"""
    SPECIAL_TOKENS = ["<ABBR>", "</ABBR>"]
    MAX_INPUT_LENGTH = 32
    DEFAULT_MODEL_PATH = "bert-base-chinese"


class NARInference:
    """NAR 缩写映射推理器"""

    def __init__(
        self,
        model_path: str = None,
        base_model_path: str = None,
        device: str = None,
        verbose: bool = False,
    ):
        _BASE_DIR = os.path.dirname(os.path.abspath(__file__))
        self.model_path = model_path or os.path.join(_BASE_DIR, "..", "models", "abbr_mapper_nar")
        self.base_model_path = base_model_path or NARConfig.DEFAULT_MODEL_PATH
        self.verbose = verbose
        self.device = device

        self.tokenizer = None
        self.model = None

        self._setup_logging()

    def _setup_logging(self):
        """配置日志"""
        logging.basicConfig(
            level=logging.INFO if self.verbose else logging.WARNING,
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        )
        self.logger = logging.getLogger(__name__)

    def load_model(self):
        """加载 NAR 模型和 tokenizer"""
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"模型路径不存在: {self.model_path}")

        # 检测模型格式
        has_full_model = os.path.exists(os.path.join(self.model_path, 'config.json'))

        if self.device is None:
            if torch.cuda.is_available():
                self.device = torch.device("cuda")
                self.logger.info(f"使用 GPU: {torch.cuda.get_device_name(0)}")
            else:
                self.device = torch.device("cpu")
                self.logger.info("使用 CPU")
        else:
            self.device = torch.device(self.device)

        # 加载完整模型
        self.logger.info("加载完整 NAR 模型")
        self.tokenizer = BertTokenizer.from_pretrained(self.model_path)
        self.tokenizer.add_special_tokens(
            {"additional_special_tokens": NARConfig.SPECIAL_TOKENS}
        )
        self.model = BertForTokenClassification.from_pretrained(
            self.model_path,
            ignore_mismatched_sizes=True,
        )

        self.model.to(self.device)
        self.model.eval()
        self.logger.info("NAR 模型加载完成")

    def _find_abbr_positions(self, input_ids: List[int]) -> List[int]:
        """找到 input_ids 中处于 <ABBR> 和 </ABBR> 之间的 token 位置"""
        abbr_open_id = self.tokenizer.convert_tokens_to_ids("<ABBR>")
        abbr_close_id = self.tokenizer.convert_tokens_to_ids("</ABBR>")

        try:
            start = input_ids.index(abbr_open_id) + 1
            end = input_ids.index(abbr_close_id)
        except ValueError:
            return []

        return list(range(start, end))

    def expand_abbr_topk(
        self,
        abbr: str,
        k: int = 5,
    ) -> List[Tuple[str, float]]:
        """
        非自回归 top-k 推理

        参数:
            abbr: 输入缩写
            k: 返回候选数量

        返回:
            [(全称, 置信度), ...]
        """
        if self.model is None:
            self.load_model()

        if not abbr or not isinstance(abbr, str):
            raise ValueError(f"缩写不能为空: {abbr}")

        # 构建输入（字母间添加空格，确保每个字母成为独立token）
        abbr_spaced = " ".join(abbr.upper())
        input_text = f"<ABBR>{abbr_spaced}</ABBR>"

        encoding = self.tokenizer(
            input_text,
            max_length=NARConfig.MAX_INPUT_LENGTH,
            truncation=True,
            return_tensors="pt",
        )

        input_ids = encoding["input_ids"][0].tolist()
        inputs = {k: v.to(self.device) for k, v in encoding.items()}

        # 找到缩写字母位置
        abbr_positions = self._find_abbr_positions(input_ids)

        if not abbr_positions:
            self.logger.warning(f"未找到缩写字母位置: {abbr}")
            return []

        # 一次前向传播
        with torch.no_grad():
            outputs = self.model(**inputs)
            logits = outputs.logits[0]  # (seq_len, vocab_size)

        # 提取缩写位置对应的 logits
        pos_logits = logits[abbr_positions]  # (num_positions, vocab_size)
        pos_probs = torch.softmax(pos_logits, dim=-1)  # (num_positions, vocab_size)

        # 每个位置取 top-n 个候选
        per_pos_n = max(int(k ** (1.0 / len(abbr_positions))) + 1, 2)
        per_pos_n = min(per_pos_n, 10)  # 上限 10

        topk_per_pos = []
        for prob in pos_probs:
            topk_vals, topk_ids = torch.topk(prob, per_pos_n)
            topk_per_pos.append(list(zip(topk_ids.tolist(), topk_vals.tolist())))

        # 笛卡尔积生成所有候选组合，计算联合置信度
        candidates = []
        for combo in itertools.product(*topk_per_pos):
            token_ids = [c[0] for c in combo]
            probs = [c[1] for c in combo]

            # 解码
            chars = self.tokenizer.decode(token_ids, skip_special_tokens=True)
            chars = chars.strip().replace(" ", "")

            if not chars:
                continue

            # 联合置信度 ∏ P_i
            joint_confidence = 1.0
            for p in probs:
                joint_confidence *= p

            # 长度归一化
            length = len(chars)
            confidence = joint_confidence ** (1.0 / length)

            candidates.append((chars, confidence))

        # 按置信度降序，取 top-k
        candidates.sort(key=lambda x: x[1], reverse=True)
        return candidates[:k]


class BERTModel:
    """BERT 缩写识别模型包装类"""

    def __init__(self):
        """初始化时立即加载模型和过滤器"""
        logger.info("=" * 60)
        logger.info("[DEBUG] BERTModel 初始化开始")
        logger.info("=" * 60)

        logger.info("[DEBUG] 正在加载 NAR 模型...")
        self.inference = NARInference(
            model_path=os.path.join(os.path.dirname(__file__), "..", "models", "abbr_mapper_nar"),
            verbose=True
        )
        self.inference.load_model()
        logger.info("[DEBUG] NAR 模型加载完成")

        # 初始化文本过滤器
        logger.info("[DEBUG] 正在初始化文本过滤器...")
        self.text_filter = get_text_filter()

        # 记录过滤器配置信息
        from config_manager import get_config_manager
        config = get_config_manager()
        logger.info(f"[DEBUG] 配置文件路径: {config.config_path}")
        logger.info(f"[DEBUG] 配置文件是否存在: {os.path.exists(config.config_path)}")
        logger.info(f"[DEBUG] 配置文件加载状态: {config.is_loaded()}")
        logger.info(f"[DEBUG] 精确匹配规则数: {len(config.get_all_exact_rules())}")
        logger.info(f"[DEBUG] 前缀匹配规则数: {len(config.get_all_prefixes())}")
        logger.info(f"[DEBUG] 前缀规则列表: {config.get_all_prefixes()}")
        logger.info("[DEBUG] 文本过滤器初始化完成")
        logger.info("=" * 60)

    def predict_single(self, text: str, k: int = 5) -> Dict[str, Any]:
        """
        单个缩写预测

        处理流程：
        1. 先进行规则过滤检查（前缀匹配、精确匹配）
        2. 如果匹配规则，直接返回结果（置信度100%）
        3. 否则调用模型进行识别

        参数:
            text: 输入缩写
            k: 返回候选数量

        返回:
            {"content": "全称", "confidence": 0.85, "alternatives": [...]}
        """
        logger.info(f"[DEBUG] predict_single 被调用，输入: '{text}'")
        sys.stdout.flush()

        # 1. 先进行过滤检查
        filter_result = self.text_filter.filter(text)
        logger.info(f"[DEBUG] 过滤结果: type={filter_result.result_type.value}, "
                   f"processed='{filter_result.processed_text}', "
                   f"output='{filter_result.output_text}', "
                   f"matched_rule='{filter_result.matched_rule}'")
        sys.stdout.flush()

        # 2. 前缀匹配：直接返回原值
        if filter_result.result_type == FilterResultType.PREFIX_MATCH:
            logger.info(f"[DEBUG] 前缀匹配成功: '{text}' -> 返回原值")
            sys.stdout.flush()
            return {
                "content": text,
                "confidence": 1.0,
                "alternatives": [{"content": text, "confidence": 1.0}]
            }

        # 3. 精确匹配：返回替换值
        if filter_result.result_type == FilterResultType.EXACT_MATCH:
            logger.info(f"[DEBUG] 精确匹配成功: '{text}' -> '{filter_result.output_text}'")
            sys.stdout.flush()
            return {
                "content": filter_result.output_text,
                "confidence": 1.0,
                "alternatives": [{"content": filter_result.output_text, "confidence": 1.0}]
            }

        # 4. 需要模型识别
        logger.info(f"[DEBUG] 未匹配规则，使用模型识别: '{text}'")
        sys.stdout.flush()
        candidates = self.inference.expand_abbr_topk(text, k=k)
        return self._format_result(text, candidates)

    def predict(self, texts: List[str], k: int = 5) -> List[Dict[str, Any]]:
        """
        批量预测（逐个处理）

        参数:
            texts: 缩写列表
            k: 每个缩写返回的候选数量

        返回:
            [{"content": "全称", "confidence": 0.85, "alternatives": [...]}, ...]
        """
        results = []
        for text in texts:
            result = self.predict_single(text, k=k)
            results.append(result)
        return results

    def predict_stream(
        self,
        texts: List[str],
        k: int = 5
    ) -> Generator[str, None, None]:
        """
        逐个预测，流式输出

        参数:
            texts: 缩写列表
            k: 每个缩写返回的候选数量

        Yields:
            SSE 格式的字符串
        """
        total = len(texts)
        for i, text in enumerate(texts):
            result = self.predict_single(text, k=k)

            # 使用前端期望的格式: {"type": "progress", "data": {...}}
            data = {
                'type': 'progress',
                'data': {
                    'index': i,
                    'total': total,
                    'abbr': text,
                    'result': result,
                    'progress': round((i + 1) / total * 100, 2)
                }
            }
            yield f"data: {json.dumps(data)}\n\n"

        # 完成事件
        complete_data = {
            'type': 'complete',
            'data': {'success': True, 'count': total}
        }
        yield f"data: {json.dumps(complete_data)}\n\n"

    def _format_result(self, text: str, candidates: List[Tuple[str, float]]) -> Dict[str, Any]:
        """
        格式化预测结果

        参数:
            text: 输入缩写
            candidates: [(全称, 置信度), ...]

        返回:
            {"content": "全称", "confidence": 0.85, "alternatives": [...]}
        """
        if not candidates:
            return {
                "content": text,
                "confidence": 0.0,
                "alternatives": []
            }

        top_candidate = candidates[0]
        alternatives = [
            {"content": name, "confidence": round(conf, 4)}
            for name, conf in candidates
        ]

        return {
            "content": top_candidate[0],
            "confidence": round(top_candidate[1], 4),
            "alternatives": alternatives
        }


# 全局模型实例（程序启动时立即加载）
model = None


def init_model():
    """初始化模型（启动时调用）"""
    global model
    if model is None:
        model = BERTModel()
    return model


def get_model():
    """获取模型实例"""
    global model
    return model


@app.route('/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        "status": "ok",
        "model_loaded": model is not None,
        "version": "1.0.0"
    })


@app.route('/predict', methods=['POST'])
def predict():
    """
    推理接口
    请求体: {"data": ["缩写1", "缩写2", ...], "k": 5}
    响应: [{"content": "全称", "confidence": 0.85, "alternatives": [...]}]
    """
    try:
        data = request.get_json()

        if not data or 'data' not in data:
            return jsonify({"error": "缺少 data 字段"}), 400

        texts = data['data']
        k = data.get('k', 5)

        if not isinstance(texts, list):
            return jsonify({"error": "data 必须是数组"}), 400

        if len(texts) == 0:
            return jsonify({"error": "data 不能为空"}), 400

        logger.info(f"收到推理请求: {len(texts)} 条数据")

        # 调用模型推理
        model = get_model()
        results = model.predict(texts, k=k)

        logger.info(f"推理完成: {len(results)} 条结果")

        return jsonify({
            "success": True,
            "count": len(results),
            "results": results
        })

    except Exception as e:
        logger.error(f"推理失败: {str(e)}")
        return jsonify({
            "error": f"推理失败: {str(e)}"
        }), 500


@app.route('/predict_stream', methods=['POST'])
def predict_stream():
    """
    流式推理接口（SSE）
    多个词逐个预测，实时返回进度

    请求体: {"data": ["缩写1", "缩写2", ...], "k": 5}
    响应: SSE 流
    """
    try:
        data = request.get_json()
        texts = data.get('data', [])
        k = data.get('k', 5)

        if not texts:
            return jsonify({"error": "data 不能为空"}), 400

        if not isinstance(texts, list):
            return jsonify({"error": "data 必须是数组"}), 400

        logger.info(f"[DEBUG] 收到流式推理请求: {len(texts)} 条数据, 内容: {texts}")
        sys.stdout.flush()

        model = get_model()
        logger.info(f"[DEBUG] 获取模型实例成功")
        sys.stdout.flush()

        def generate():
            logger.info(f"[DEBUG] 开始生成流式响应")
            sys.stdout.flush()
            for chunk in model.predict_stream(texts, k=k):
                yield chunk

        return Response(
            stream_with_context(generate()),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no'
            }
        )

    except Exception as e:
        logger.error(f"流式推理失败: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/batch_predict', methods=['POST'])
def batch_predict():
    """
    批量推理接口（处理大量数据）
    分批处理，避免内存溢出
    """
    try:
        data = request.get_json()
        texts = data.get('data', [])
        batch_size = data.get('batch_size', 100)
        k = data.get('k', 5)

        all_results = []
        model = get_model()

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            batch_results = model.predict(batch, k=k)
            all_results.extend(batch_results)
            logger.info(f"已处理: {min(i + batch_size, len(texts))}/{len(texts)}")

        return jsonify({
            "success": True,
            "count": len(all_results),
            "results": all_results
        })

    except Exception as e:
        logger.error(f"批量推理失败: {str(e)}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    # 程序启动时立即加载模型
    logger.info("=" * 60)
    logger.info("BERT 缩写识别推理服务启动中...")
    logger.info("=" * 60)

    init_model()

    logger.info("模型加载完成，启动 HTTP 服务...")
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
