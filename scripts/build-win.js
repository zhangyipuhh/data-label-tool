#!/usr/bin/env node
/**
 * Windows 打包脚本
 * 自动检查环境并执行打包
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

console.log('🚀 开始 Windows 打包流程...
')

// 1. 检查 Node.js 版本
try {
  const nodeVersion = process.version
  console.log(`✅ Node.js 版本: ${nodeVersion}`)
} catch (e) {
  console.error('❌ Node.js 未安装')
  process.exit(1)
}

// 2. 检查 Python
try {
  const pythonVersion = execSync('python --version', { encoding: 'utf-8' }).trim()
  console.log(`✅ Python: ${pythonVersion}`)
} catch (e) {
  console.warn('⚠️  Python 未找到，打包后可能无法运行推理服务')
}

// 3. 检查依赖
console.log('
📦 检查依赖...')
if (!fs.existsSync('node_modules')) {
  console.log('安装 npm 依赖...')
  execSync('npm install', { stdio: 'inherit' })
}

// 4. 检查图标
const iconPath = path.join('build', 'icon.ico')
if (!fs.existsSync(iconPath)) {
  console.warn(`⚠️  图标文件不存在: ${iconPath}`)
  console.log('   将使用默认图标，建议添加自定义图标')

  // 创建默认图标目录
  if (!fs.existsSync('build')) {
    fs.mkdirSync('build')
  }
}

// 5. 执行打包
console.log('
🔨 开始构建...')
try {
  execSync('npm run build:win', { stdio: 'inherit' })
  console.log('
✅ 打包完成!')

  // 显示输出文件
  const releaseDir = path.join('release')
  if (fs.existsSync(releaseDir)) {
    const files = fs.readdirSync(releaseDir)
    console.log('
📁 输出文件:')
    files.forEach(f => {
      const stats = fs.statSync(path.join(releaseDir, f))
      const size = (stats.size / 1024 / 1024).toFixed(2)
      console.log(`   - ${f} (${size} MB)`)
    })
  }
} catch (e) {
  console.error('
❌ 打包失败:', e.message)
  process.exit(1)
}

console.log('
🎉 完成! 安装程序位于 release/ 目录')
