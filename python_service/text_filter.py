#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文本过滤模块
用于在模型识别前进行规则匹配和过滤
"""

from enum import Enum
from typing import Optional, Dict, Any
from dataclasses import dataclass

from config_manager import get_config_manager, ConfigManager
from text_preprocessor import preprocess_text
from logger_config import get_logger

logger = get_logger(__name__)


class FilterResultType(Enum):
    """
    过滤结果类型
    """
    PREFIX_MATCH = "prefix_match"      # 前缀匹配，返回原值
    EXACT_MATCH = "exact_match"        # 精确匹配，返回替换值
    NEED_MODEL = "need_model"          # 需要模型识别


@dataclass
class FilterResult:
    """
    过滤结果数据类

    属性:
        result_type: 过滤结果类型
        original_text: 原始输入文本
        processed_text: 预处理后的文本
        output_text: 输出文本（匹配时）
        confidence: 置信度（匹配时为 1.0）
        matched_rule: 匹配到的规则（如果有）
    """
    result_type: FilterResultType
    original_text: str
    processed_text: str
    output_text: Optional[str] = None
    confidence: float = 1.0
    matched_rule: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """
        转换为字典格式

        返回:
            结果字典
        """
        return {
            "result_type": self.result_type.value,
            "original_text": self.original_text,
            "processed_text": self.processed_text,
            "output_text": self.output_text,
            "confidence": self.confidence,
            "matched_rule": self.matched_rule
        }


class TextFilter:
    """
    文本过滤器

    负责在模型识别前进行规则匹配：
    1. 前缀匹配：匹配成功直接返回原值
    2. 精确匹配：匹配成功返回替换值，置信度100%
    """

    def __init__(self, config_manager: ConfigManager = None):
        """
        初始化文本过滤器

        参数:
            config_manager: 配置管理器实例，默认使用全局实例
        """
        self.config = config_manager or get_config_manager()

    def filter(self, text: str) -> FilterResult:
        """
        对文本进行过滤检查

        处理流程：
        1. 预处理文本（大写、去下划线）
        2. 检查前缀匹配
        3. 检查精确匹配
        4. 返回过滤结果

        参数:
            text: 原始输入文本

        返回:
            FilterResult 对象
        """
        # 预处理文本
        processed_text = preprocess_text(text)

        if not processed_text:
            return FilterResult(
                result_type=FilterResultType.NEED_MODEL,
                original_text=text,
                processed_text=processed_text,
                output_text=None,
                confidence=0.0
            )

        # 1. 检查前缀匹配（优先级最高）
        matched_prefix = self.config.match_prefix(processed_text)
        if matched_prefix:
            return FilterResult(
                result_type=FilterResultType.PREFIX_MATCH,
                original_text=text,
                processed_text=processed_text,
                output_text=text,  # 前缀匹配返回原值
                confidence=1.0,
                matched_rule=f"prefix:{matched_prefix}"
            )

        # 2. 检查精确匹配
        exact_match_result = self.config.get_exact_match(processed_text)
        if exact_match_result:
            return FilterResult(
                result_type=FilterResultType.EXACT_MATCH,
                original_text=text,
                processed_text=processed_text,
                output_text=exact_match_result,  # 精确匹配返回替换值
                confidence=1.0,
                matched_rule=f"exact:{processed_text}"
            )

        # 3. 需要模型识别
        return FilterResult(
            result_type=FilterResultType.NEED_MODEL,
            original_text=text,
            processed_text=processed_text,
            output_text=None,
            confidence=0.0
        )

    def should_use_model(self, text: str) -> bool:
        """
        检查是否需要使用模型识别

        参数:
            text: 原始输入文本

        返回:
            是否需要模型识别
        """
        result = self.filter(text)
        return result.result_type == FilterResultType.NEED_MODEL

    def get_filtered_result(self, text: str) -> Optional[FilterResult]:
        """
        获取过滤结果（仅当匹配规则时返回）

        参数:
            text: 原始输入文本

        返回:
            如果匹配规则返回 FilterResult，否则返回 None
        """
        result = self.filter(text)
        if result.result_type != FilterResultType.NEED_MODEL:
            return result
        return None


# 全局过滤器实例
_filter: Optional[TextFilter] = None


def get_text_filter() -> TextFilter:
    """
    获取全局文本过滤器实例（单例模式）

    返回:
        TextFilter 实例
    """
    global _filter
    if _filter is None:
        _filter = TextFilter()
    return _filter


def reset_text_filter() -> None:
    """
    重置全局文本过滤器实例
    """
    global _filter
    _filter = None


def filter_text(text: str) -> FilterResult:
    """
    过滤文本的便捷函数

    参数:
        text: 原始输入文本

    返回:
        FilterResult 对象
    """
    return get_text_filter().filter(text)
