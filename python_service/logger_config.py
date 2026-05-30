#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
日志配置模块

提供统一的日志配置管理，支持通过配置文件设置日志级别、本地文件存储、自动轮转。
使用 RotatingFileHandler 实现日志文件按大小自动轮转，同时输出到终端和文件。
支持运行时热重载配置，无需重启服务即可更新日志级别。
"""

import json
import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from typing import Optional, List, Tuple

_logger_initialized = False
_logging_config_cache = {}

# 预初始化日志缓冲区，用于在 setup_logging() 之前缓存日志消息
# 格式: [(level, message), ...]
_pre_init_logs: List[Tuple[str, str]] = []


def pre_log(level: str, message: str):
    """预初始化日志记录

    在 setup_logging() 之前使用，将日志消息缓存到缓冲区。
    setup_logging() 完成后会自动刷出到实际的日志系统。

    参数:
        level: 日志级别字符串（DEBUG / INFO / WARNING / ERROR）
        message: 日志消息内容
    """
    _pre_init_logs.append((level.upper(), message))


def _flush_pre_init_logs():
    """刷出预初始化日志缓冲区

    将 setup_logging() 之前缓存的所有日志消息通过 logger 输出。
    调用后清空缓冲区。
    """
    if not _pre_init_logs:
        return

    logger = logging.getLogger("pre_init")
    for level, message in _pre_init_logs:
        log_func = getattr(logger, level.lower(), logger.info)
        log_func(message)

    _pre_init_logs.clear()


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


def _get_default_config():
    """获取默认日志配置

    返回:
        dict: 默认日志配置字典
    """
    return {
        "level": "INFO",
        "log_dir": "log",
        "log_file": "python_service.log",
        "max_bytes": 1048576,
        "backup_count": 5,
        "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        "date_format": "%Y-%m-%d %H:%M:%S"
    }


def _load_logging_config():
    """加载日志配置文件

    优先从 CONFIG_DIR 环境变量指定的目录加载，
    配置文件不存在时使用默认配置。

    返回:
        dict: 日志配置字典
    """
    global _logging_config_cache
    config_path = os.path.join(get_config_dir(), "logging_config.json")

    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            _logging_config_cache = config
            return config
        except (json.JSONDecodeError, IOError) as e:
            pre_log("WARNING", f"日志配置文件读取失败: {e}，使用默认配置")
    else:
        pre_log("INFO", f"日志配置文件不存在: {config_path}，使用默认配置")

    default_config = _get_default_config()
    _logging_config_cache = default_config
    return default_config


def _get_level_value(level_str: str) -> int:
    """将日志级别字符串转换为对应的整数值

    参数:
        level_str: 日志级别字符串（DEBUG / INFO / WARNING / ERROR / CRITICAL）

    返回:
        int: 对应的日志级别整数值
    """
    level_map = {
        "DEBUG": logging.DEBUG,
        "INFO": logging.INFO,
        "WARNING": logging.WARNING,
        "WARN": logging.WARNING,
        "ERROR": logging.ERROR,
        "CRITICAL": logging.CRITICAL,
    }
    return level_map.get(level_str.upper(), logging.INFO)


def setup_logging():
    """初始化日志系统

    在 app.py 启动时最早调用，配置全局日志处理器。
    读取日志配置文件，设置日志级别和输出格式，
    同时输出到终端（StreamHandler）和本地文件（RotatingFileHandler）。
    """
    global _logger_initialized

    if _logger_initialized:
        return

    config = _load_logging_config()
    level = _get_level_value(config.get("level", "INFO"))
    log_format = config.get("format", "%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    date_format = config.get("date_format", "%Y-%m-%d %H:%M:%S")

    formatter = logging.Formatter(log_format, datefmt=date_format)

    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    if hasattr(console_handler.stream, 'reconfigure'):
        console_handler.stream.reconfigure(encoding='utf-8')
    root_logger.addHandler(console_handler)

    log_dir = os.path.join(get_base_dir(), config.get("log_dir", "log"))
    log_file = config.get("log_file", "python_service.log")
    log_path = os.path.join(log_dir, log_file)
    max_bytes = config.get("max_bytes", 1048576)
    backup_count = config.get("backup_count", 5)

    try:
        os.makedirs(log_dir, exist_ok=True)
        file_handler = RotatingFileHandler(
            log_path,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding='utf-8'
        )
        file_handler.setLevel(level)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)
    except (OSError, IOError) as e:
        pre_log("WARNING", f"创建日志文件失败: {e}，日志将仅输出到终端")

    _logger_initialized = True

    # 刷出预初始化日志缓冲区，确保 setup_logging() 之前的日志也能写入文件
    _flush_pre_init_logs()


def get_logger(name: str) -> logging.Logger:
    """获取配置好的 logger 实例

    参数:
        name: logger 名称，通常使用 __name__

    返回:
        logging.Logger: 配置好的 logger 实例
    """
    if not _logger_initialized:
        setup_logging()
    return logging.getLogger(name)


def reload_logging_config() -> dict:
    """运行时重载日志配置

    读取最新的日志配置文件，更新所有 handler 的级别。
    前端保存日志配置后调用此函数使配置立即生效。

    返回:
        dict: 更新后的日志配置
    """
    global _logger_initialized, _logging_config_cache

    config = _load_logging_config()
    level = _get_level_value(config.get("level", "INFO"))

    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    for handler in root_logger.handlers:
        handler.setLevel(level)

    _logger_initialized = True
    return config


def get_current_level() -> str:
    """获取当前日志级别

    返回:
        str: 当前日志级别字符串
    """
    return _logging_config_cache.get("level", "INFO")
