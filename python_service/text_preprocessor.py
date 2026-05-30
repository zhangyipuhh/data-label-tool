#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文本预处理模块
用于识别前的数据预处理
"""

import re
from typing import Optional

from logger_config import get_logger

logger = get_logger(__name__)


class TextPreprocessor:
    """
    文本预处理器

    负责将文本转换为统一格式，用于后续的匹配和识别
    注意：预处理仅用于匹配判断，不影响最终返回的原始数据
    """

    @staticmethod
    def preprocess(text: str) -> str:
        """
        预处理文本

        处理步骤：
        1. 去除前后空白字符
        2. 转换为大写
        3. 去除下划线

        参数:
            text: 原始输入文本

        返回:
            预处理后的文本

        示例:
            >>> TextPreprocessor.preprocess("hello_world")
            'HELLOWORLD'
            >>> TextPreprocessor.preprocess("Shape_Area")
            'SHAPEAREA'
        """
        if not text or not isinstance(text, str):
            logger.debug(f"预处理输入无效，返回空字符串: {text}")
            return ""

        original = text
        result = text.strip().upper().replace("_", "")

        logger.debug(f"文本预处理: '{original}' -> '{result}'")
        return result

    @staticmethod
    def normalize_for_display(text: str) -> str:
        """
        标准化文本用于显示

        仅去除前后空白，保留原始格式

        参数:
            text: 原始输入文本

        返回:
            标准化后的文本
        """
        if not text or not isinstance(text, str):
            return ""
        return text.strip()


# 便捷函数

def preprocess_text(text: str) -> str:
    """
    预处理文本的便捷函数

    参数:
        text: 原始输入文本

    返回:
        预处理后的文本
    """
    return TextPreprocessor.preprocess(text)


def normalize_text(text: str) -> str:
    """
    标准化文本的便捷函数

    参数:
        text: 原始输入文本

    返回:
        标准化后的文本
    """
    return TextPreprocessor.normalize_for_display(text)
