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
import threading
import queue
import time
from typing import List, Dict, Any, Tuple, Generator, Optional
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from waitress import serve

from logger_config import setup_logging, get_logger

# PyInstaller 打包模式下，尝试从外部 site-packages 加载 torch 等大依赖
# 手动注入 PYTHONPATH 到 sys.path，确保能找到客户端已安装的库
if getattr(sys, 'frozen', False):
    _site_packages_paths = []
    _env_pythonpath = os.environ.get('PYTHONPATH', '')
    if _env_pythonpath:
        for _p in _env_pythonpath.split(';' if sys.platform == 'win32' else ':'):
            _p = _p.strip()
            if _p and os.path.isdir(_p) and _p not in sys.path:
                sys.path.insert(0, _p)
                _site_packages_paths.append(_p)

# 尝试导入 torch 和 transformers（大依赖由客户端自行安装，不打包进可执行文件）
# 调试：打印 sys.path 和 PYTHONPATH，帮助排查导入问题
if getattr(sys, 'frozen', False):
    print(f"[DEBUG] sys.frozen = True")
    print(f"[DEBUG] PYTHONPATH = {os.environ.get('PYTHONPATH', 'NOT SET')}")
    print(f"[DEBUG] sys.path = {sys.path}")
    print(f"[DEBUG] site-packages injected = {_site_packages_paths}")

try:
    import torch
    from transformers import BertTokenizer, BertForTokenClassification
    _TORCH_AVAILABLE = True
    print(f"[DEBUG] torch imported successfully, version = {torch.__version__}")
except ImportError as _e:
    torch = None
    BertTokenizer = None
    BertForTokenClassification = None
    _TORCH_AVAILABLE = False
    _TORCH_IMPORT_ERROR = str(_e)
    print(f"[DEBUG] torch import failed: {_TORCH_IMPORT_ERROR}")

# 导入过滤模块
from text_filter import get_text_filter, FilterResultType
from config_manager import get_config_manager

# 设置 stdout/stderr 编码为 utf-8，解决 Windows 终端中文乱码问题
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 初始化日志系统（从配置文件读取日志级别）
setup_logging()
logger = get_logger(__name__)

app = Flask(__name__)
CORS(app)


def get_base_dir():
    """获取基础目录路径

    PyInstaller 打包后使用可执行文件所在目录，
    开发模式使用脚本所在目录。

    返回:
        str: 基础目录的绝对路径
    """
    if getattr(sys, 'frozen', False):
        # PyInstaller 打包后，使用可执行文件所在目录
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def get_config_dir():
    """获取配置目录路径

    优先使用环境变量 CONFIG_DIR（由 Electron 传入），
    否则使用相对于脚本/可执行文件的路径。

    返回:
        str: 配置目录的绝对路径
    """
    env_dir = os.environ.get('CONFIG_DIR')
    if env_dir and os.path.isdir(env_dir):
        return env_dir
    return os.path.join(get_base_dir(), "..", "config")


def get_models_dir():
    """获取模型目录路径

    优先使用环境变量 MODEL_DIR（由 Electron 传入），
    否则使用相对于脚本/可执行文件的路径。

    返回:
        str: 模型目录的绝对路径
    """
    env_dir = os.environ.get('MODEL_DIR')
    if env_dir and os.path.isdir(env_dir):
        return env_dir
    return os.path.join(get_base_dir(), "..", "models")


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
        _BASE_DIR = get_base_dir()
        self.model_path = model_path or os.path.join(get_models_dir(), "abbr_mapper_nar")
        self.base_model_path = base_model_path or NARConfig.DEFAULT_MODEL_PATH
        self.verbose = verbose
        self.device = device

        self.tokenizer = None
        self.model = None

        self.logger = get_logger(__name__)

    def _load_gpu_config(self) -> dict:
        """加载 GPU 配置文件

        返回:
            dict: GPU 配置字典，包含 device 和 cuda_visible_devices 等字段

        异常:
            无，配置文件不存在或格式错误时返回默认配置
        """
        _BASE_DIR = get_base_dir()
        config_path = os.path.join(get_config_dir(), "gpu_config.json")
        default_config = {"device": "auto", "cuda_visible_devices": ""}

        if not os.path.exists(config_path):
            self.logger.info(f"GPU 配置文件不存在，使用默认配置: {default_config}")
            return default_config

        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            self.logger.info(f"GPU 配置加载成功: {config}")
            return config
        except (json.JSONDecodeError, IOError) as e:
            self.logger.warning(f"GPU 配置文件读取失败: {e}，使用默认配置")
            return default_config

    def _apply_cuda_visible_devices(self, cuda_visible_devices: str):
        """设置 CUDA_VISIBLE_DEVICES 环境变量

        参数:
            cuda_visible_devices: CUDA 可见设备字符串，如 "0" 或 "0,1"
                为空时不做任何设置
        """
        if cuda_visible_devices:
            os.environ["CUDA_VISIBLE_DEVICES"] = cuda_visible_devices
            self.logger.info(f"设置 CUDA_VISIBLE_DEVICES = {cuda_visible_devices}")

    def _verify_gpu_usage(self):
        """验证模型是否真正在 GPU 上运行

        检查模型所在设备、GPU 显存占用等信息，
        并输出详细日志帮助诊断 GPU 使用问题
        """
        if not torch.cuda.is_available():
            self.logger.warning("CUDA 不可用，模型运行在 CPU 上")
            return

        # 检查模型设备
        model_device = next(self.model.parameters()).device
        self.logger.info(f"[GPU 验证] 模型所在设备: {model_device}")

        # 检查 CUDA 版本
        cuda_version = torch.version.cuda
        self.logger.info(f"[GPU 验证] PyTorch CUDA 版本: {cuda_version}")
        if cuda_version is None:
            self.logger.warning("[GPU 验证] PyTorch CUDA 版本为 None，可能安装的是 CPU 版本 PyTorch！")
            self.logger.warning("[GPU 验证] 请使用以下命令安装 GPU 版本:")
            self.logger.warning("[GPU 验证]   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128")

        # 检查 GPU 显存占用
        current_device = torch.cuda.current_device()
        allocated_mb = torch.cuda.memory_allocated(current_device) / 1024 / 1024
        reserved_mb = torch.cuda.memory_reserved(current_device) / 1024 / 1024
        total_mb = torch.cuda.get_device_properties(current_device).total_memory / 1024 / 1024
        self.logger.info(f"[GPU 验证] GPU 显存 - 已分配: {allocated_mb:.1f}MB, 已预留: {reserved_mb:.1f}MB, 总量: {total_mb:.1f}MB")
        self.logger.info(f"[GPU 验证] GPU 设备名: {torch.cuda.get_device_name(current_device)}")

        if allocated_mb > 0:
            self.logger.info("[GPU 验证] ✓ 模型已成功加载到 GPU，显存已分配")
        else:
            self.logger.warning("[GPU 验证] ✗ GPU 显存分配为 0，模型可能未真正在 GPU 上运行！")

    def load_model(self):
        """加载 NAR 模型和 tokenizer

        加载流程：
        1. 读取 GPU 配置文件
        2. 应用 CUDA_VISIBLE_DEVICES 设置
        3. 根据配置或自动检测选择计算设备
        4. 加载模型和 tokenizer
        5. 将模型移至目标设备并验证 GPU 使用情况

        异常:
            FileNotFoundError: 模型路径不存在时抛出
        """
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"模型路径不存在: {self.model_path}")

        # 检测模型格式
        has_full_model = os.path.exists(os.path.join(self.model_path, 'config.json'))

        # 加载 GPU 配置
        gpu_config = self._load_gpu_config()

        # 应用 CUDA_VISIBLE_DEVICES（必须在 torch.cuda 调用之前设置）
        cuda_visible_devices = gpu_config.get("cuda_visible_devices", "")
        self._apply_cuda_visible_devices(cuda_visible_devices)

        # 确定计算设备
        config_device = gpu_config.get("device", "auto")
        env_device = os.environ.get("NAR_DEVICE", None)

        # 优先级：构造参数 > 环境变量 > 配置文件 > 自动检测
        if self.device is None:
            effective_device = env_device or (config_device if config_device != "auto" else None)
            if effective_device:
                self.device = torch.device(effective_device)
                self.logger.info(f"使用指定设备: {self.device} (来源: {'环境变量 NAR_DEVICE' if env_device else '配置文件'})")
            elif torch.cuda.is_available():
                self.device = torch.device("cuda")
                self.logger.info(f"使用 GPU: {torch.cuda.get_device_name(0)}")
            else:
                self.device = torch.device("cpu")
                self.logger.info("使用 CPU")
        else:
            self.device = torch.device(self.device)
            self.logger.info(f"使用指定设备: {self.device}")

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

        # 验证 GPU 使用情况
        self._verify_gpu_usage()

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
        logger.info("BERTModel 初始化开始")
        logger.info("=" * 60)

        # 读取环境变量中的设备配置
        env_device = os.environ.get("NAR_DEVICE", None)
        if env_device:
            logger.debug(f"从环境变量 NAR_DEVICE 读取设备: {env_device}")

        logger.info("正在加载 NAR 模型...")
        self.inference = NARInference(
            model_path=os.path.join(get_models_dir(), "abbr_mapper_nar"),
            device=env_device,
            verbose=True
        )
        self.inference.load_model()
        logger.info("NAR 模型加载完成")

        # 初始化文本过滤器
        logger.info("正在初始化文本过滤器...")
        self.text_filter = get_text_filter()

        # 记录过滤器配置信息
        from config_manager import get_config_manager
        config = get_config_manager()
        logger.debug(f"配置文件路径: {config.config_path}")
        logger.debug(f"配置文件是否存在: {os.path.exists(config.config_path)}")
        logger.debug(f"配置文件加载状态: {config.is_loaded()}")
        logger.debug(f"精确匹配规则数: {len(config.get_all_exact_rules())}")
        logger.debug(f"前缀匹配规则数: {len(config.get_all_prefixes())}")
        logger.debug(f"前缀规则列表: {config.get_all_prefixes()}")
        logger.info("文本过滤器初始化完成")
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
        logger.debug(f"predict_single 被调用，输入: '{text}'")

        # 1. 先进行过滤检查
        filter_result = self.text_filter.filter(text)
        logger.debug(f"过滤结果: type={filter_result.result_type.value}, "
                   f"processed='{filter_result.processed_text}', "
                   f"output='{filter_result.output_text}', "
                   f"matched_rule='{filter_result.matched_rule}'")

        # 2. 前缀匹配：直接返回原值
        if filter_result.result_type == FilterResultType.PREFIX_MATCH:
            logger.debug(f"前缀匹配成功: '{text}' -> 返回原值")
            return {
                "content": text,
                "confidence": 1.0,
                "alternatives": [{"content": text, "confidence": 1.0}]
            }

        # 3. 精确匹配：返回替换值
        if filter_result.result_type == FilterResultType.EXACT_MATCH:
            logger.debug(f"精确匹配成功: '{text}' -> '{filter_result.output_text}'")
            return {
                "content": filter_result.output_text,
                "confidence": 1.0,
                "alternatives": [{"content": filter_result.output_text, "confidence": 1.0}]
            }

        # 4. 需要模型识别
        logger.debug(f"未匹配规则，使用模型识别: '{text}'")
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
    if not _TORCH_AVAILABLE:
        logger.warning("=" * 60)
        logger.warning("[警告] torch/transformers 未安装，推理功能不可用")
        logger.warning("请执行以下命令安装依赖:")
        logger.warning("  pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128")
        logger.warning("  pip install transformers tokenizers safetensors")
        logger.warning("=" * 60)
        return None
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


@app.route('/gpu_info', methods=['GET'])
def gpu_info():
    """GPU 诊断接口

    返回当前 GPU 使用状态，包括 CUDA 可用性、设备名称、
    CUDA 版本、模型所在设备、显存占用等信息。

    返回:
        JSON 格式的 GPU 状态信息
    """
    if not _TORCH_AVAILABLE:
        return jsonify({
            "error": "torch 未安装",
            "message": "请在客户端安装 torch 后重试",
            "install_command": "pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128"
        }), 503

    info = {
        "cuda_available": torch.cuda.is_available(),
        "pytorch_version": torch.__version__,
        "cuda_version": str(torch.version.cuda) if torch.version.cuda else None,
        "cudnn_available": torch.backends.cudnn.is_available(),
    }

    if torch.cuda.is_available():
        current_device = torch.cuda.current_device()
        info.update({
            "device_name": torch.cuda.get_device_name(current_device),
            "device_count": torch.cuda.device_count(),
            "current_device": current_device,
            "memory_allocated_mb": round(torch.cuda.memory_allocated(current_device) / 1024 / 1024, 1),
            "memory_reserved_mb": round(torch.cuda.memory_reserved(current_device) / 1024 / 1024, 1),
            "memory_total_mb": round(torch.cuda.get_device_properties(current_device).total_memory / 1024 / 1024, 1),
        })

    # 模型设备信息
    if model is not None and model.inference.model is not None:
        model_device = next(model.inference.model.parameters()).device
        info["model_device"] = str(model_device)
    else:
        info["model_device"] = None

    return jsonify(info)


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
        if model is None:
            return jsonify({
                "success": False,
                "error": "模型未加载",
                "message": "torch/transformers 未安装，请安装后重试",
                "install_command": "pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128 && pip install transformers tokenizers safetensors"
            }), 503

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


def sse_with_heartbeat(generator: Generator[str, None, None], interval: float = 30.0) -> Generator[str, None, None]:
    """
    为 SSE 生成器添加心跳注释，防止长连接被中间代理或客户端超时断开

    参数:
        generator: 原始 SSE 数据生成器
        interval: 心跳间隔（秒），默认 30 秒

    Yields:
        SSE 格式的字符串（含心跳注释）
    """
    q: queue.Queue = queue.Queue()
    stop_event = threading.Event()
    last_yield_time = time.time()

    def producer():
        """生产者线程：从原始生成器读取数据放入队列"""
        try:
            for item in generator:
                q.put(item)
        finally:
            stop_event.set()

    def heartbeat():
        """心跳线程：定期发送 SSE 注释行（:heartbeat）保活"""
        while not stop_event.is_set():
            stop_event.wait(interval)
            if not stop_event.is_set():
                q.put(":heartbeat\n\n")

    producer_thread = threading.Thread(target=producer, daemon=True)
    heartbeat_thread = threading.Thread(target=heartbeat, daemon=True)
    producer_thread.start()
    heartbeat_thread.start()

    while True:
        try:
            item = q.get(timeout=interval + 5)
            if item is None:
                break
            yield item
            last_yield_time = time.time()
        except queue.Empty:
            if stop_event.is_set() and q.empty():
                break
            if time.time() - last_yield_time > interval * 2:
                break


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

        logger.info(f"收到流式推理请求: {len(texts)} 条数据")
        logger.debug(f"流式推理数据内容: {texts}")

        model = get_model()
        if model is None:
            return jsonify({
                "success": False,
                "error": "模型未加载",
                "message": "torch/transformers 未安装，请安装后重试",
                "install_command": "pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128 && pip install transformers tokenizers safetensors"
            }), 503

        logger.debug("获取模型实例成功")

        def generate():
            logger.debug("开始生成流式响应")
            for chunk in model.predict_stream(texts, k=k):
                yield chunk

        return Response(
            stream_with_context(sse_with_heartbeat(generate(), interval=30.0)),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no'
            }
        )

    except Exception as e:
        logger.error(f"流式推理失败: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/reload-config', methods=['POST'])
def reload_config():
    """重载过滤配置接口

    通知 ConfigManager 重新读取配置文件，实现热重载。
    修改 filter_config.json 后调用此接口即可生效，无需重启服务。

    返回:
        JSON 格式的重载结果，包含成功状态和规则数量信息
    """
    try:
        config = get_config_manager()
        config.reload()
        logger.info("过滤配置已重载")
        return jsonify({
            "success": True,
            "message": "配置已重载",
            "exact_match_count": len(config.get_all_exact_rules()),
            "prefix_count": len(config.get_all_prefixes())
        })
    except Exception as e:
        logger.error(f"重载配置失败: {str(e)}")
        return jsonify({"success": False, "message": f"重载配置失败: {str(e)}"}), 500


@app.route('/api/reload-logging-config', methods=['POST'])
def reload_logging_config_route():
    """重载日志配置接口

    运行时热重载日志配置，读取最新的 logging_config.json 并更新日志级别。
    前端修改日志级别后调用此接口使配置立即生效，无需重启服务。

    返回:
        JSON 格式的重载结果，包含更新后的日志级别
    """
    try:
        from logger_config import reload_logging_config
        config = reload_logging_config()
        logger.info(f"日志配置已重载，当前级别: {config.get('level', 'INFO')}")
        return jsonify({
            "success": True,
            "message": "日志配置已重载",
            "level": config.get("level", "INFO")
        })
    except Exception as e:
        logger.error(f"重载日志配置失败: {str(e)}")
        return jsonify({"success": False, "message": f"重载日志配置失败: {str(e)}"}), 500


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
    # 使用 waitress 生产级 WSGI 服务器替代 Flask 开发服务器
    # 避免打包后出现 "This is a development server" 警告
    logger.info(f"服务监听地址: http://0.0.0.0:{port}")
    serve(app, host='0.0.0.0', port=port, threads=8)
