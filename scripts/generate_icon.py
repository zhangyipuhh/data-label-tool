#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成应用程序图标 (icon.ico)
使用 Pillow 库创建一个简洁的数据标注工具图标
"""

from PIL import Image, ImageDraw, ImageFont
import os


def create_icon(output_path: str = "build/icon.ico") -> str:
    """
    创建应用程序图标
    
    参数:
        output_path: 输出图标文件路径，默认为 build/icon.ico
        
    返回:
        生成的图标文件绝对路径
        
    异常:
        如果 Pillow 库未安装会抛出 ImportError
        如果文件写入失败会抛出 IOError
    """
    # 确保输出目录存在
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # 图标尺寸列表（Windows ICO 标准尺寸）
    sizes = [16, 24, 32, 48, 64, 128, 256]
    
    images = []
    
    for size in sizes:
        # 创建图像（RGBA 模式支持透明）
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        # 计算比例因子
        scale = size / 256.0
        
        # 绘制圆角矩形背景（蓝色渐变效果）
        padding = int(8 * scale)
        corner_radius = int(40 * scale)
        
        # 主背景色
        bg_color = (59, 130, 246)  # 蓝色
        bg_color_dark = (37, 99, 235)  # 深蓝色
        
        # 绘制圆角矩形
        draw.rounded_rectangle(
            [padding, padding, size - padding, size - padding],
            radius=corner_radius,
            fill=bg_color
        )
        
        # 绘制内部高亮效果
        highlight_padding = int(12 * scale)
        draw.rounded_rectangle(
            [highlight_padding, highlight_padding, 
             size - highlight_padding, int(size * 0.55)],
            radius=int(30 * scale),
            fill=(96, 165, 250, 180)  # 浅蓝色半透明
        )
        
        # 绘制"标注"文字
        text = "标"
        
        # 根据尺寸选择字体大小
        if size <= 24:
            font_size = int(14 * scale)
        elif size <= 48:
            font_size = int(20 * scale)
        elif size <= 128:
            font_size = int(24 * scale)
        else:
            font_size = int(28 * scale)
        
        # 尝试使用系统字体
        font = None
        font_paths = [
            "C:/Windows/Fonts/msyh.ttc",  # 微软雅黑
            "C:/Windows/Fonts/simhei.ttf",  # 黑体
            "C:/Windows/Fonts/simsun.ttc",  # 宋体
        ]
        
        for font_path in font_paths:
            if os.path.exists(font_path):
                try:
                    font = ImageFont.truetype(font_path, font_size)
                    break
                except:
                    continue
        
        if font is None:
            font = ImageFont.load_default()
        
        # 计算文字位置（居中）
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        text_x = (size - text_width) // 2
        text_y = (size - text_height) // 2 - int(2 * scale)
        
        # 绘制文字阴影
        shadow_offset = max(1, int(2 * scale))
        draw.text(
            (text_x + shadow_offset, text_y + shadow_offset),
            text,
            font=font,
            fill=(0, 0, 0, 80)
        )
        
        # 绘制主文字（白色）
        draw.text(
            (text_x, text_y),
            text,
            font=font,
            fill=(255, 255, 255, 255)
        )
        
        images.append(img)
    
    # 保存为 ICO 文件
    # ICO 格式：第一张图像是主图像，其余是多尺寸版本
    main_image = images[-1]  # 使用 256x256 作为主图像
    other_images = images[:-1]
    
    main_image.save(
        output_path,
        format='ICO',
        sizes=[(img.width, img.height) for img in images],
        append_images=other_images
    )
    
    return os.path.abspath(output_path)


def create_mac_icon(output_path: str = "build/icon.icns") -> str:
    """
    创建 macOS 图标 (icon.icns)
    
    参数:
        output_path: 输出图标文件路径，默认为 build/icon.icns
        
    返回:
        生成的图标文件绝对路径
        
    说明:
        macOS ICNS 格式需要特殊处理，这里生成 PNG 作为替代
        实际打包时 electron-builder 会自动处理
    """
    # 确保输出目录存在
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # 生成 512x512 的 PNG 图标
    img = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 绘制圆角矩形背景
    padding = 16
    corner_radius = 80
    
    bg_color = (59, 130, 246)  # 蓝色
    
    draw.rounded_rectangle(
        [padding, padding, 512 - padding, 512 - padding],
        radius=corner_radius,
        fill=bg_color
    )
    
    # 绘制内部高亮效果
    highlight_padding = 24
    draw.rounded_rectangle(
        [highlight_padding, highlight_padding, 
         512 - highlight_padding, int(512 * 0.55)],
        radius=60,
        fill=(96, 165, 250, 180)
    )
    
    # 绘制"标"文字
    text = "标"
    
    font = None
    font_paths = [
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/simsun.ttc",
    ]
    
    for font_path in font_paths:
        if os.path.exists(font_path):
            try:
                font = ImageFont.truetype(font_path, 200)
                break
            except:
                continue
    
    if font is None:
        font = ImageFont.load_default()
    
    # 计算文字位置（居中）
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    text_x = (512 - text_width) // 2
    text_y = (512 - text_height) // 2 - 4
    
    # 绘制文字阴影
    draw.text(
        (text_x + 4, text_y + 4),
        text,
        font=font,
        fill=(0, 0, 0, 80)
    )
    
    # 绘制主文字
    draw.text(
        (text_x, text_y),
        text,
        font=font,
        fill=(255, 255, 255, 255)
    )
    
    # 保存为 PNG（electron-builder 会自动转换为 icns）
    png_path = output_path.replace('.icns', '.png')
    img.save(png_path, format='PNG')
    
    return os.path.abspath(png_path)


if __name__ == '__main__':
    # 生成 Windows 图标
    ico_path = create_icon("build/icon.ico")
    print(f"Windows 图标已生成: {ico_path}")
    
    # 生成 macOS 图标
    icns_path = create_mac_icon("build/icon.icns")
    print(f"macOS 图标已生成: {icns_path}")
    
    print("图标生成完成！")
