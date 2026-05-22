#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
过滤功能测试模块
用于测试配置管理、文本预处理和过滤功能
"""

import sys
import os
import io

# 设置 stdout/stderr 编码为 utf-8，解决 Windows 终端中文乱码问题
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 添加当前目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from text_preprocessor import TextPreprocessor, preprocess_text
from config_manager import ConfigManager, get_config_manager, reset_config_manager
from text_filter import TextFilter, FilterResultType, get_text_filter, reset_text_filter


def test_text_preprocessor():
    """测试文本预处理功能"""
    print("\n" + "=" * 60)
    print("测试文本预处理功能")
    print("=" * 60)

    test_cases = [
        ("hello_world", "HELLOWORLD"),
        ("Shape_Area", "SHAPEAREA"),
        ("xzqdm", "XZQDM"),
        ("BSM", "BSM"),
        ("  test_id  ", "TESTID"),
        ("A_B_C", "ABC"),
        ("", ""),
        ("normal", "NORMAL"),
    ]

    all_passed = True
    for input_text, expected in test_cases:
        result = TextPreprocessor.preprocess(input_text)
        status = "✓" if result == expected else "✗"
        if result != expected:
            all_passed = False
        print(f"{status} preprocess('{input_text}') = '{result}' (期望: '{expected}')")

    print(f"\n预处理测试: {'全部通过' if all_passed else '有失败'}")
    return all_passed


def test_config_manager():
    """测试配置管理功能"""
    print("\n" + "=" * 60)
    print("测试配置管理功能")
    print("=" * 60)

    # 重置配置管理器
    reset_config_manager()

    config = get_config_manager()

    print(f"配置加载状态: {config.is_loaded()}")
    print(f"精确匹配规则数: {len(config.get_all_exact_rules())}")
    print(f"前缀匹配规则数: {len(config.get_all_prefixes())}")

    # 测试精确匹配
    print("\n测试精确匹配:")
    exact_tests = [
        ("ID", "标识符"),
        ("NO", "编号"),
        ("NAME", "名称"),
        ("CODE", "代码"),
        ("UNKNOWN", None),
    ]

    all_passed = True
    for text, expected in exact_tests:
        result = config.get_exact_match(text)
        status = "✓" if result == expected else "✗"
        if result != expected:
            all_passed = False
        print(f"{status} get_exact_match('{text}') = '{result}' (期望: '{expected}')")

    # 测试前缀匹配
    print("\n测试前缀匹配:")
    prefix_tests = [
        ("SHAPE", "SHAPE"),
        ("SHAPEAREA", "SHAPE"),
        ("GEOM", "GEOM"),
        ("GEOMETRY", "GEOM"),
        ("FID", "FID"),
        ("FID_1", "FID"),
        ("BSM", None),
        ("normal", None),
    ]

    for text, expected in prefix_tests:
        result = config.match_prefix(text)
        status = "✓" if result == expected else "✗"
        if result != expected:
            all_passed = False
        print(f"{status} match_prefix('{text}') = '{result}' (期望: '{expected}')")

    print(f"\n配置管理测试: {'全部通过' if all_passed else '有失败'}")
    return all_passed


def test_text_filter():
    """测试文本过滤功能"""
    print("\n" + "=" * 60)
    print("测试文本过滤功能")
    print("=" * 60)

    # 重置过滤器
    reset_text_filter()

    filter_obj = get_text_filter()

    # 测试前缀匹配
    print("\n测试前缀匹配过滤:")
    prefix_tests = [
        ("SHAPE", "SHAPE"),
        ("Shape_Area", "Shape_Area"),
        ("GEOM_DATA", "GEOM_DATA"),
        ("FID_1", "FID_1"),
    ]

    all_passed = True
    for text, expected_output in prefix_tests:
        result = filter_obj.filter(text)
        status = "✓" if (result.result_type == FilterResultType.PREFIX_MATCH and
                        result.output_text == expected_output) else "✗"
        if result.result_type != FilterResultType.PREFIX_MATCH or result.output_text != expected_output:
            all_passed = False
        print(f"{status} filter('{text}') -> {result.result_type.value}, output='{result.output_text}'")
        print(f"    预处理结果: '{result.processed_text}'")

    # 测试精确匹配
    print("\n测试精确匹配过滤:")
    exact_tests = [
        ("ID", "标识符"),
        ("NO", "编号"),
        ("name", "名称"),
        ("code", "代码"),
        ("i_d", "标识符"),  # 带下划线的ID
        ("n_o", "编号"),    # 带下划线的NO
    ]

    for text, expected_output in exact_tests:
        result = filter_obj.filter(text)
        status = "✓" if (result.result_type == FilterResultType.EXACT_MATCH and
                        result.output_text == expected_output) else "✗"
        if result.result_type != FilterResultType.EXACT_MATCH or result.output_text != expected_output:
            all_passed = False
        print(f"{status} filter('{text}') -> {result.result_type.value}, output='{result.output_text}'")
        print(f"    预处理结果: '{result.processed_text}'")

    # 测试需要模型识别的情况
    print("\n测试需要模型识别的情况:")
    model_tests = ["bsm", "xzqdm", "mj", "unknown"]

    for text in model_tests:
        result = filter_obj.filter(text)
        status = "✓" if result.result_type == FilterResultType.NEED_MODEL else "✗"
        if result.result_type != FilterResultType.NEED_MODEL:
            all_passed = False
        print(f"{status} filter('{text}') -> {result.result_type.value}")
        print(f"    预处理结果: '{result.processed_text}'")

    print(f"\n文本过滤测试: {'全部通过' if all_passed else '有失败'}")
    return all_passed


def test_integration():
    """测试集成场景"""
    print("\n" + "=" * 60)
    print("测试集成场景")
    print("=" * 60)

    filter_obj = get_text_filter()

    # 模拟实际场景
    test_cases = [
        {
            "input": "SHAPE",
            "expected_type": FilterResultType.PREFIX_MATCH,
            "expected_output": "SHAPE",
            "description": "SHAPE前缀匹配"
        },
        {
            "input": "Shape_Length",
            "expected_type": FilterResultType.PREFIX_MATCH,
            "expected_output": "Shape_Length",
            "description": "Shape_前缀匹配（保留原值）"
        },
        {
            "input": "ID",
            "expected_type": FilterResultType.EXACT_MATCH,
            "expected_output": "标识符",
            "description": "ID精确匹配"
        },
        {
            "input": "i_d",
            "expected_type": FilterResultType.EXACT_MATCH,
            "expected_output": "标识符",
            "description": "i_d预处理后匹配ID"
        },
        {
            "input": "n_o",
            "expected_type": FilterResultType.EXACT_MATCH,
            "expected_output": "编号",
            "description": "n_o预处理后匹配NO"
        },
        {
            "input": "bsm",
            "expected_type": FilterResultType.NEED_MODEL,
            "expected_output": None,
            "description": "bsm需要模型识别"
        },
        {
            "input": "xzqdm",
            "expected_type": FilterResultType.NEED_MODEL,
            "expected_output": None,
            "description": "xzqdm需要模型识别"
        },
    ]

    all_passed = True
    for case in test_cases:
        result = filter_obj.filter(case["input"])
        passed = (result.result_type == case["expected_type"] and
                 (case["expected_output"] is None or result.output_text == case["expected_output"]))

        status = "✓" if passed else "✗"
        if not passed:
            all_passed = False

        print(f"\n{status} {case['description']}")
        print(f"    输入: '{case['input']}'")
        print(f"    预处理: '{result.processed_text}'")
        print(f"    结果类型: {result.result_type.value}")
        print(f"    输出: '{result.output_text}'")
        print(f"    置信度: {result.confidence}")

    print(f"\n集成测试: {'全部通过' if all_passed else '有失败'}")
    return all_passed


def run_all_tests():
    """运行所有测试"""
    print("\n" + "=" * 60)
    print("开始运行过滤功能测试")
    print("=" * 60)

    results = []
    results.append(("文本预处理", test_text_preprocessor()))
    results.append(("配置管理", test_config_manager()))
    results.append(("文本过滤", test_text_filter()))
    results.append(("集成场景", test_integration()))

    print("\n" + "=" * 60)
    print("测试汇总")
    print("=" * 60)

    for name, passed in results:
        status = "✓ 通过" if passed else "✗ 失败"
        print(f"{status}: {name}")

    all_passed = all(passed for _, passed in results)
    print("\n" + "=" * 60)
    if all_passed:
        print("✓ 所有测试全部通过！")
    else:
        print("✗ 部分测试失败，请检查")
    print("=" * 60)

    return all_passed


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
