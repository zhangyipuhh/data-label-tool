#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BERT 微调模型推理服务
提供 HTTP API 供 Electron 调用
"""

import os
import sys
import json
import logging
from typing import List, Dict, Any
from flask import Flask, request, jsonify
from flask_cors import CORS

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# 全局模型实例（延迟加载）
model = None

class MockBERTModel:
    """
    模拟 BERT 模型（用于开发和测试）
    实际使用时替换为真实模型加载代码
    """

    def __init__(self):
        logger.info("初始化模拟 BERT 模型...")
        # 实际加载代码示例：
        # from transformers import AutoTokenizer, AutoModelForSequenceClassification
        # self.tokenizer = AutoTokenizer.from_pretrained('./model')
        # self.model = AutoModelForSequenceClassification.from_pretrained('./model')

    def predict(self, texts: List[str]) -> List[Dict[str, Any]]:
        """
        对输入文本列表进行推理
        返回: [{content, confidence, alternatives}]
        """
        import random
        results = []

        for text in texts:
            # 模拟推理结果
            # 实际使用时替换为:
            # inputs = self.tokenizer(text, return_tensors='pt', padding=True, truncation=True)
            # outputs = self.model(**inputs)
            # predictions = torch.softmax(outputs.logits, dim=-1)

            confidence = random.uniform(0.6, 0.95)

            # 根据置信度生成不同质量的结果
            if confidence > 0.85:
                content = f"识别结果: {text[:20]}... (高质量)"
            elif confidence > 0.7:
                content = f"识别结果: {text[:20]}... (中等质量)"
            else:
                content = f"识别结果: {text[:20]}... (需人工审核)"

            # 生成备选结果
            alternatives = [
                {
                    "content": f"备选A: {text[:15]}...",
                    "confidence": max(0.1, confidence - random.uniform(0.1, 0.3))
                },
                {
                    "content": f"备选B: {text[:15]}...",
                    "confidence": max(0.05, confidence - random.uniform(0.2, 0.4))
                }
            ]

            results.append({
                "content": content,
                "confidence": round(confidence, 4),
                "alternatives": alternatives
            })

        return results

def get_model():
    """获取或初始化模型（单例模式）"""
    global model
    if model is None:
        model = MockBERTModel()
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
    请求体: {"data": ["文本1", "文本2", ...], "column_name": "列名"}
    响应: [{"content": "结果", "confidence": 0.85, "alternatives": [...]}]
    """
    try:
        data = request.get_json()

        if not data or 'data' not in data:
            return jsonify({"error": "缺少 data 字段"}), 400

        texts = data['data']
        column_name = data.get('column_name', 'unknown')

        if not isinstance(texts, list):
            return jsonify({"error": "data 必须是数组"}), 400

        if len(texts) == 0:
            return jsonify({"error": "data 不能为空"}), 400

        logger.info(f"收到推理请求: {len(texts)} 条数据, 列: {column_name}")

        # 调用模型推理
        model = get_model()
        results = model.predict(texts)

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

        all_results = []
        model = get_model()

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            batch_results = model.predict(batch)
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
    # 预加载模型
    logger.info("正在加载模型...")
    get_model()
    logger.info("模型加载完成，启动服务...")

    # 启动服务
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
