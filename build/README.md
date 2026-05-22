# 图标文件

打包 Windows 安装程序需要以下图标文件：

1. build/icon.ico - Windows 应用图标 (256x256, 多尺寸 ICO)
2. build/icon.icns - macOS 应用图标 (多种尺寸)
3. build/icon.png - Linux 应用图标 (512x512)

可以使用在线工具转换:
- https://convertio.co/zh/png-ico/ (PNG 转 ICO)
- https://cloudconvert.com/png-to-icns (PNG 转 ICNS)

或者使用 npm 包生成:
```bash
npm install -g electron-icon-builder
electron-icon-builder --input=./assets/logo.png --output=./build
```
