#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
配置管理模块
用于读取和管理过滤配置文件
"""

import json
import os
import sys
from typing import Dict, List, Any, Optional

from logger_config import get_logger

logger = get_logger(__name__)


def get_base_dir():
    """获取基础目录路径

    PyInstaller 打包后使用可执行文件所在目录，
    开发模式使用脚本所在目录。

    返回:
        str: 基础目录的绝对路径
    """
    if getattr(sys, 'frozen', False):
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


class ConfigManager:
    """
    配置管理类

    负责读取和解析过滤配置文件，提供配置查询接口
    """

    DEFAULT_CONFIG_PATH = os.path.join(
        get_config_dir(),
        "filter_config.json"
    )

    def __init__(self, config_path: str = None):
        """
        初始化配置管理器

        参数:
            config_path: 配置文件路径，默认为 config/filter_config.json
        """
        self.config_path = config_path or self.DEFAULT_CONFIG_PATH
        self._config: Dict[str, Any] = {}
        self._exact_match_map: Dict[str, str] = {}
        self._prefixes: List[str] = []
        self._loaded = False

        self._load_config()

    def _load_config(self) -> None:
        """
        加载配置文件

        如果配置文件不存在，记录警告日志，服务继续运行
        """
        if not os.path.exists(self.config_path):
            logger.warning(f"配置文件不存在: {self.config_path}")
            return

        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                self._config = json.load(f)

            # 构建精确匹配映射表
            exact_match_rules = self._config.get('rules', {}).get('exact_match', {})
            for item in exact_match_rules.get('items', []):
                from_val = item.get('from', '').strip().upper()
                to_val = item.get('to', '').strip()
                if from_val:
                    self._exact_match_map[from_val] = to_val

            # 构建前缀列表
            prefix_rules = self._config.get('rules', {}).get('prefix_match', {})
            self._prefixes = [
                p.strip().upper()
                for p in prefix_rules.get('prefixes', [])
                if p.strip()
            ]

            self._loaded = True
            logger.info(f"配置文件加载成功: {self.config_path}")
            logger.info(f"精确匹配规则: {len(self._exact_match_map)} 条")
            logger.info(f"前缀匹配规则: {len(self._prefixes)} 条")

        except json.JSONDecodeError as e:
            logger.error(f"配置文件 JSON 格式错误: {e}")
        except Exception as e:
            logger.error(f"加载配置文件失败: {e}")

    def reload(self) -> None:
        """
        重新加载配置文件
        """
        self._exact_match_map.clear()
        self._prefixes.clear()
        self._load_config()

    def is_loaded(self) -> bool:
        """
        检查配置是否成功加载

        返回:
            配置是否成功加载
        """
        return self._loaded

    def get_exact_match(self, text: str) -> Optional[str]:
        """
        获取精确匹配结果

        参数:
            text: 输入文本（应已预处理为大写）

        返回:
            匹配成功返回替换值，失败返回 None
        """
        return self._exact_match_map.get(text.upper())

    def has_exact_match(self, text: str) -> bool:
        """
        检查是否有精确匹配

        参数:
            text: 输入文本（应已预处理为大写）

        返回:
            是否有精确匹配规则
        """
        return text.upper() in self._exact_match_map

    def match_prefix(self, text: str) -> Optional[str]:
        """
        检查是否匹配前缀规则

        参数:
            text: 输入文本（应已预处理为大写）

        返回:
            匹配成功返回匹配到的前缀，失败返回 None
        """
        text_upper = text.upper()
        for prefix in self._prefixes:
            if text_upper.startswith(prefix):
                return prefix
        return None

    def has_prefix_match(self, text: str) -> bool:
        """
        检查是否有前缀匹配

        参数:
            text: 输入文本（应已预处理为大写）

        返回:
            是否有前缀匹配规则
        """
        return self.match_prefix(text) is not None

    def get_all_exact_rules(self) -> Dict[str, str]:
        """
        获取所有精确匹配规则

        返回:
            精确匹配规则字典
        """
        return self._exact_match_map.copy()

    def get_all_prefixes(self) -> List[str]:
        """
        获取所有前缀匹配规则

        返回:
            前缀列表
        """
        return self._prefixes.copy()


# 全局配置管理器实例
_config_manager: Optional[ConfigManager] = None


def get_config_manager(config_path: str = None) -> ConfigManager:
    """
    获取全局配置管理器实例（单例模式）

    参数:
        config_path: 配置文件路径

    返回:
        ConfigManager 实例
    """
    global _config_manager
    if _config_manager is None:
        _config_manager = ConfigManager(config_path)
    return _config_manager


def reset_config_manager() -> None:
    """
    重置全局配置管理器实例
    """
    global _config_manager
    _config_manager = None
