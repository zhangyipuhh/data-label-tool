#!/usr/bin/env node
/**
 * Windows 打包脚本
 * 自动检查环境、打包 Python 服务、构建 Electron 应用
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// 配置国内镜像源（避免 GitHub 连接超时）
process.env.ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
process.env.ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'

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

// 验证 Python 打包输出（兼容 PyInstaller 5.x/6.x 不同输出结构）
const possiblePaths = [
  path.join(pythonDistDir, 'app', 'app.exe'),
  path.join(pythonDistDir, 'app.exe')
]
let appExePath = null
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    appExePath = p
    break
  }
}
if (!appExePath) {
  console.error('❌ Python 服务可执行文件未生成')
  console.error('   期望路径之一:', possiblePaths.join(' 或 '))
  if (fs.existsSync(pythonDistDir)) {
    console.error('   python_dist 目录内容:')
    try {
      const entries = fs.readdirSync(pythonDistDir, { withFileTypes: true })
      entries.forEach(e => {
        const type = e.isDirectory() ? '[DIR]' : '[FILE]'
        console.error(`     ${type} ${e.name}`)
      })
    } catch (err) {
      console.error('   无法读取目录:', err.message)
    }
  } else {
    console.error('   python_dist 目录不存在')
  }
  process.exit(1)
}
console.log(`✅ Python 服务可执行文件: ${appExePath}`)

// 规范化输出结构：确保为 python_dist/app/ 目录（与 package.json extraResources 匹配）
const expectedAppDir = path.join(pythonDistDir, 'app')
if (path.dirname(appExePath) !== expectedAppDir) {
  console.log('⚠️  检测到 PyInstaller 输出结构非目录模式，进行规范化...')
  if (!fs.existsSync(expectedAppDir)) {
    fs.mkdirSync(expectedAppDir, { recursive: true })
  }
  // 移动 app.exe
  const targetExe = path.join(expectedAppDir, 'app.exe')
  fs.renameSync(appExePath, targetExe)
  appExePath = targetExe
  // 移动 _internal 目录（如果存在）
  const internalDir = path.join(pythonDistDir, '_internal')
  if (fs.existsSync(internalDir)) {
    const targetInternal = path.join(expectedAppDir, '_internal')
    fs.renameSync(internalDir, targetInternal)
    console.log('   ✅ _internal 目录已移动')
  }
  // 移动其他文件/目录
  const entries = fs.readdirSync(pythonDistDir, { withFileTypes: true })
  for (const entry of entries) {
    const src = path.join(pythonDistDir, entry.name)
    if (src === expectedAppDir) continue
    const dst = path.join(expectedAppDir, entry.name)
    fs.renameSync(src, dst)
  }
  console.log('   ✅ 输出结构已规范化为 python_dist/app/')
}

// 8. 检查图标
const iconPath = path.join('build', 'icon.ico')
if (!fs.existsSync(iconPath)) {
  console.warn(`⚠️  图标文件不存在: ${iconPath}`)
  console.log('   将使用默认图标，建议添加自定义图标')

  // 创建默认图标目录
  if (!fs.existsSync('build')) {
    fs.mkdirSync('build')
  }
}

// 9. 执行 Electron 打包
console.log('\n🔨 构建 Electron 应用...')
const packageJson = JSON.parse(fs.readFileSync(path.join('package.json'), 'utf-8'))
const outputDirName = packageJson.build?.directories?.output || 'release'
try {
  execSync('npm run build:win', { stdio: 'inherit' })
  console.log('\n✅ 打包完成!')

  // 验证安装包
  console.log('\n🔍 验证安装包完整性...')
  const releaseDir = path.join(outputDirName)
  if (!fs.existsSync(releaseDir)) {
    console.error(`❌ ${outputDirName} 目录不存在，打包可能失败`)
    process.exit(1)
  }

  const exeFiles = []
  const searchExeFiles = (dir) => {
    const files = fs.readdirSync(dir, { withFileTypes: true })
    for (const file of files) {
      const fullPath = path.join(dir, file.name)
      if (file.isDirectory()) {
        searchExeFiles(fullPath)
      } else if (file.name.endsWith('.exe')) {
        const stats = fs.statSync(fullPath)
        if (stats.size === 0) {
          console.error(`❌ 安装程序文件大小为 0，文件可能损坏: ${fullPath}`)
          process.exit(1)
        }
        exeFiles.push({ path: fullPath, size: stats.size })
      }
    }
  }
  searchExeFiles(releaseDir)

  if (exeFiles.length === 0) {
    console.error('❌ 未找到安装程序 exe 文件')
    process.exit(1)
  }

  console.log('✅ 找到以下安装程序:')
  exeFiles.forEach(f => {
    const sizeMB = (f.size / 1024 / 1024).toFixed(2)
    console.log(`   ${f.path} (${sizeMB} MB)`)
  })

  // 显示 release 目录下所有输出文件
  const allFiles = fs.readdirSync(releaseDir)
  if (allFiles.length > exeFiles.length) {
    console.log('\n📁 其他输出文件:')
    allFiles.forEach(f => {
      const fullPath = path.join(releaseDir, f)
      const stats = fs.statSync(fullPath)
      const size = (stats.size / 1024 / 1024).toFixed(2)
      console.log(`   - ${f} (${size} MB)`)
    })
  }
} catch (e) {
  console.error('\n❌ Electron 打包失败:', e.message)
  process.exit(1)
}

console.log(`\n🎉 完成! 安装程序位于 ${outputDirName}/ 目录`)
console.log('\n✅ 提示: 安装后 resources/models/ 目录已自动创建，可将模型文件直接放入该目录')
