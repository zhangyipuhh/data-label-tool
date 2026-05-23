#!/usr/bin/env node
/**
 * Windows 打包脚本
 * 自动检查环境、打包 Python 服务、构建 Electron 应用
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

console.log('🚀 开始 Windows 打包流程...\n')

// 1. 检查 Node.js 版本
try {
  const nodeVersion = process.version
  console.log(`✅ Node.js 版本: ${nodeVersion}`)
} catch (e) {
  console.error('❌ Node.js 未安装')
  process.exit(1)
}

// 2. 检查 Python
let pythonCmd = 'python'
try {
  const pythonVersion = execSync('python --version', { encoding: 'utf-8' }).trim()
  console.log(`✅ Python: ${pythonVersion}`)
} catch (e) {
  try {
    const pythonVersion = execSync('python3 --version', { encoding: 'utf-8' }).trim()
    console.log(`✅ Python3: ${pythonVersion}`)
    pythonCmd = 'python3'
  } catch (e2) {
    console.error('❌ Python 未安装，无法打包 Python 服务')
    process.exit(1)
  }
}

// 3. 检查并安装 npm 依赖
console.log('\n📦 检查 npm 依赖...')
if (!fs.existsSync('node_modules')) {
  console.log('安装 npm 依赖...')
  execSync('npm install', { stdio: 'inherit' })
}

// 4. 检查并安装 PyInstaller
console.log('\n📦 检查 PyInstaller...')
try {
  execSync(`${pythonCmd} -m PyInstaller --version`, { encoding: 'utf-8' })
  console.log('✅ PyInstaller 已安装')
} catch (e) {
  console.log('安装 PyInstaller...')
  execSync(`${pythonCmd} -m pip install pyinstaller`, { stdio: 'inherit' })
}

// 5. 安装 Python 推理依赖
console.log('\n📦 检查 Python 依赖...')
const requirementsPath = path.join('python_service', 'requirements.txt')
if (fs.existsSync(requirementsPath)) {
  console.log('安装 Python 依赖（可能需要较长时间）...')
  try {
    execSync(`${pythonCmd} -m pip install -r ${requirementsPath}`, { stdio: 'inherit' })
  } catch (e) {
    console.warn('⚠️  部分 Python 依赖安装失败，继续打包...')
  }
}

// 6. 使用 PyInstaller 打包 Python 服务
console.log('\n🔨 打包 Python 服务...')
const specPath = path.join('python_service', 'data-label-tool.spec')
if (!fs.existsSync(specPath)) {
  console.error('❌ PyInstaller 配置文件不存在:', specPath)
  process.exit(1)
}

// 清理旧的打包输出
const pythonDistDir = path.join('python_dist')
if (fs.existsSync(pythonDistDir)) {
  console.log('清理旧的 Python 打包输出...')
  fs.rmSync(pythonDistDir, { recursive: true, force: true })
}

try {
  execSync(
    `${pythonCmd} -m PyInstaller ${specPath} --noconfirm --distpath ${pythonDistDir} --workpath ${path.join('python_dist', 'build')}`,
    { stdio: 'inherit', cwd: process.cwd() }
  )
  console.log('✅ Python 服务打包完成')
} catch (e) {
  console.error('❌ Python 服务打包失败:', e.message)
  process.exit(1)
}

// 验证 Python 打包输出
const appExePath = path.join(pythonDistDir, 'app', 'app.exe')
if (!fs.existsSync(appExePath)) {
  console.error('❌ Python 服务可执行文件未生成:', appExePath)
  process.exit(1)
}
console.log(`✅ Python 服务可执行文件: ${appExePath}`)

// 7. 检查图标
const iconPath = path.join('build', 'icon.ico')
if (!fs.existsSync(iconPath)) {
  console.warn(`⚠️  图标文件不存在: ${iconPath}`)
  console.log('   将使用默认图标，建议添加自定义图标')

  // 创建默认图标目录
  if (!fs.existsSync('build')) {
    fs.mkdirSync('build')
  }
}

// 8. 执行 Electron 打包
console.log('\n🔨 构建 Electron 应用...')
try {
  execSync('npm run build:win', { stdio: 'inherit' })
  console.log('\n✅ 打包完成!')

  // 显示输出文件
  const releaseDir = path.join('release')
  if (fs.existsSync(releaseDir)) {
    const files = fs.readdirSync(releaseDir)
    console.log('\n📁 输出文件:')
    files.forEach(f => {
      const stats = fs.statSync(path.join(releaseDir, f))
      const size = (stats.size / 1024 / 1024).toFixed(2)
      console.log(`   - ${f} (${size} MB)`)
    })
  }
} catch (e) {
  console.error('\n❌ Electron 打包失败:', e.message)
  process.exit(1)
}

console.log('\n🎉 完成! 安装程序位于 release/ 目录')
console.log('\n⚠️  注意: 用户安装后需手动将 models/abbr_mapper_nar/ 目录复制到安装目录的 resources/models/ 下')
