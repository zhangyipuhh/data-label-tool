import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import path from 'path'
import * as XLSX from 'xlsx'
import Database from 'better-sqlite3'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import net from 'net'

// 禁用 undici body timeout，防止 SSE 流式预测因等待时间过长而中断
process.env.UNDICI_BODY_TIMEOUT = '0'
import {
  createEncryptedDb,
  openEncryptedDb,
  isDebugMode,
  getDbEncryption
} from './db-encryption'

let mainWindow: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null
let db: Database.Database | null = null
let predictionDb: Database.Database | null = null
let feedbackDb: Database.Database | null = null
let pythonServicePort: number = 5000

// 数据目录路径（打包后使用 userData 目录）
const DATA_DIR = path.join(app.getPath('userData'), 'data')

/**
 * 文件树节点接口
 * @property name - 文件或文件夹名称
 * @property path - 完整路径
 * @property type - 类型：文件或目录
 * @property children - 子节点列表（仅目录有）
 * @property isXlsx - 是否为 Excel 文件
 */
interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
  isXlsx?: boolean
}

/**
 * 递归读取目录树结构
 * @param dirPath - 目录路径
 * @param maxDepth - 最大递归深度，默认 3
 * @param currentDepth - 当前递归深度，默认 0
 * @returns FileTreeNode[] 文件树节点数组
 */
function readDirectoryTree(dirPath: string, maxDepth: number = 3, currentDepth: number = 0): FileTreeNode[] {
  if (currentDepth >= maxDepth) return []

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    // 排序：文件夹在前，文件在后；按名称排序
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

    return sorted
      .filter(entry => {
        // 隐藏文件/文件夹跳过
        if (entry.name.startsWith('.')) return false
        // node_modules 跳过
        if (entry.name === 'node_modules') return false
        return true
      })
      .map(entry => {
        const fullPath = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          return {
            name: entry.name,
            path: fullPath,
            type: 'directory' as const,
            children: readDirectoryTree(fullPath, maxDepth, currentDepth + 1)
          }
        } else {
          const isXlsx = entry.name.endsWith('.xlsx') || entry.name.endsWith('.xls')
          return {
            name: entry.name,
            path: fullPath,
            type: 'file' as const,
            isXlsx
          }
        }
      })
  } catch (error) {
    console.error('读取目录失败:', error)
    return []
  }
}

function getPythonServicePath(): string {
  const isDev = !app.isPackaged
  if (isDev) {
    return path.join(__dirname, '..', 'python_service')
  }
  return path.join(process.resourcesPath, 'python_service')
}

/**
 * 获取配置文件目录路径
 * 开发模式：项目根目录下的 config/
 * 打包模式：首次运行从 resources/config/ 复制到 userData/config/，后续读写 userData
 * @returns 配置文件目录的绝对路径
 */
function getConfigDir(): string {
  if (!app.isPackaged) {
    return path.join(__dirname, '..', 'config')
  }
  const userConfigDir = path.join(app.getPath('userData'), 'config')
  if (!fs.existsSync(userConfigDir)) {
    fs.mkdirSync(userConfigDir, { recursive: true })
    // 首次运行时，从 resources 复制默认配置到 userData
    const resourceConfigDir = path.join(process.resourcesPath, 'config')
    if (fs.existsSync(resourceConfigDir)) {
      fs.cpSync(resourceConfigDir, userConfigDir, { recursive: true })
    }
  }
  return userConfigDir
}

/**
 * 获取模型目录路径
 * 开发模式：项目根目录下的 models/
 * 打包模式：安装目录下的 resources/models/（用户手动放置）
 * @returns 模型目录的绝对路径
 */
function getModelsDir(): string {
  if (!app.isPackaged) {
    return path.join(__dirname, '..', 'models')
  }
  return path.join(process.resourcesPath, 'models')
}

/**
 * 初始化反馈数据库（加密）
 * 使用 SQLCipher 加密保护数据安全
 * @returns void
 * @throws 数据库连接或表创建失败时抛出错误
 */
function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'feedback.db')

  // 检查是否存在旧版本未加密数据库，需要迁移
  const legacyDbPath = dbPath + '.legacy'
  if (fs.existsSync(dbPath) && !isDebugMode()) {
    // 尝试打开，如果失败可能是加密数据库
    try {
      const testDb = new Database(dbPath, { readonly: true })
      testDb.prepare('SELECT 1').get()
      testDb.close()

      // 如果是明文数据库，迁移到加密数据库
      console.log('[DB] 发现明文数据库，正在迁移到加密数据库...')
      fs.renameSync(dbPath, legacyDbPath)

      // 创建新的加密数据库
      db = createEncryptedDb(dbPath)
      if (!db) {
        throw new Error('创建加密数据库失败')
      }

      // 从旧数据库导入数据
      const legacyDb = new Database(legacyDbPath, { readonly: true })
      const tables = legacyDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()

      for (const table of tables) {
        const tableName = (table as any).name
        if (tableName === 'sqlite_sequence') continue

        const createSql = legacyDb.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(tableName) as any
        if (createSql && createSql.sql) {
          db.exec(createSql.sql)

          const rows = legacyDb.prepare(`SELECT * FROM "${tableName}"`).all()
          if (rows.length > 0) {
            const columns = Object.keys(rows[0] as Record<string, unknown>)
            const placeholders = columns.map(() => '?').join(',')
            const insertStmt = db.prepare(`INSERT INTO "${tableName}" (${columns.join(',')}) VALUES (${placeholders})`)

            for (const row of rows) {
              insertStmt.run(...columns.map(col => (row as Record<string, unknown>)[col]))
            }
          }
        }
      }

      legacyDb.close()
      fs.unlinkSync(legacyDbPath)
      console.log('[DB] 数据库迁移完成')
    } catch (error) {
      // 可能是加密数据库，尝试用密钥打开
      db = openEncryptedDb(dbPath)
      if (!db) {
        console.error('[DB] 无法打开数据库，可能是密钥错误')
        // 创建新的加密数据库
        db = createEncryptedDb(dbPath)
      }
    }
  } else {
    // 创建新的加密数据库
    db = createEncryptedDb(dbPath)
  }

  if (!db) {
    console.error('[DB] 数据库初始化失败')
    return
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      input_text TEXT NOT NULL,
      model_output TEXT,
      confidence REAL,
      user_confirm INTEGER DEFAULT 0,
      corrected_value TEXT,
      column_name TEXT,
      file_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);
    CREATE INDEX IF NOT EXISTS idx_feedback_file ON feedback(file_name);
  `)
  console.log('加密数据库已初始化:', dbPath)
}

/**
 * 确保数据目录存在
 * 如果目录不存在则创建
 * @throws 创建目录失败时抛出错误
 */
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    console.log('数据目录已创建:', DATA_DIR)
  }
}

/**
 * 初始化预测数据库（加密）
 * 创建 prediction_records 表和相关索引
 * @returns void
 * @throws 数据库连接或表创建失败时抛出错误
 */
function initPredictionDatabase(): void {
  const dbPath = path.join(DATA_DIR, 'predictions.db')

  // 检查是否存在旧版本未加密数据库，需要迁移
  const legacyDbPath = dbPath + '.legacy'
  if (fs.existsSync(dbPath) && !isDebugMode()) {
    try {
      const testDb = new Database(dbPath, { readonly: true })
      testDb.prepare('SELECT 1').get()
      testDb.close()

      // 如果是明文数据库，迁移到加密数据库
      console.log('[DB] 发现明文预测数据库，正在迁移到加密数据库...')
      fs.renameSync(dbPath, legacyDbPath)

      predictionDb = createEncryptedDb(dbPath)
      if (!predictionDb) {
        throw new Error('创建加密预测数据库失败')
      }

      // 从旧数据库导入数据
      const legacyDb = new Database(legacyDbPath, { readonly: true })
      const tables = legacyDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()

      for (const table of tables) {
        const tableName = (table as any).name
        if (tableName === 'sqlite_sequence') continue

        const createSql = legacyDb.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(tableName) as any
        if (createSql && createSql.sql) {
          predictionDb.exec(createSql.sql)

          const rows = legacyDb.prepare(`SELECT * FROM "${tableName}"`).all()
          if (rows.length > 0) {
            const columns = Object.keys(rows[0] as Record<string, unknown>)
            const placeholders = columns.map(() => '?').join(',')
            const insertStmt = predictionDb.prepare(`INSERT INTO "${tableName}" (${columns.join(',')}) VALUES (${placeholders})`)

            for (const row of rows) {
              insertStmt.run(...columns.map(col => (row as Record<string, unknown>)[col]))
            }
          }
        }
      }

      legacyDb.close()
      fs.unlinkSync(legacyDbPath)
      console.log('[DB] 预测数据库迁移完成')
    } catch (error) {
      predictionDb = openEncryptedDb(dbPath)
      if (!predictionDb) {
        console.error('[DB] 无法打开预测数据库，可能是密钥错误')
        predictionDb = createEncryptedDb(dbPath)
      }
    }
  } else {
    predictionDb = createEncryptedDb(dbPath)
  }

  if (!predictionDb) {
    console.error('[DB] 预测数据库初始化失败')
    return
  }

  predictionDb.exec(`
    CREATE TABLE IF NOT EXISTS prediction_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      source_field TEXT NOT NULL,
      predicted_result TEXT,
      user_selected_result TEXT,
      confidence REAL,
      column_name TEXT,
      file_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_prediction_batch_id ON prediction_records(batch_id);
    CREATE INDEX IF NOT EXISTS idx_prediction_created_at ON prediction_records(created_at);
    CREATE INDEX IF NOT EXISTS idx_prediction_file_name ON prediction_records(file_name);
  `)
  console.log('加密预测数据库已初始化:', dbPath)
}

/**
 * 初始化反馈记录数据库（加密）
 * 创建 feedback_records 表和相关索引
 * @returns void
 * @throws 数据库连接或表创建失败时抛出错误
 */
function initFeedbackDatabase(): void {
  const dbPath = path.join(DATA_DIR, 'feedback.db')

  // 检查是否存在旧版本未加密数据库，需要迁移
  const legacyDbPath = dbPath + '.legacy'
  if (fs.existsSync(dbPath) && !isDebugMode()) {
    try {
      const testDb = new Database(dbPath, { readonly: true })
      testDb.prepare('SELECT 1').get()
      testDb.close()

      // 如果是明文数据库，迁移到加密数据库
      console.log('[DB] 发现明文反馈数据库，正在迁移到加密数据库...')
      fs.renameSync(dbPath, legacyDbPath)

      feedbackDb = createEncryptedDb(dbPath)
      if (!feedbackDb) {
        throw new Error('创建加密反馈数据库失败')
      }

      // 从旧数据库导入数据
      const legacyDb = new Database(legacyDbPath, { readonly: true })
      const tables = legacyDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()

      for (const table of tables) {
        const tableName = (table as any).name
        if (tableName === 'sqlite_sequence') continue

        const createSql = legacyDb.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(tableName) as any
        if (createSql && createSql.sql) {
          feedbackDb.exec(createSql.sql)

          const rows = legacyDb.prepare(`SELECT * FROM "${tableName}"`).all()
          if (rows.length > 0) {
            const columns = Object.keys(rows[0] as Record<string, unknown>)
            const placeholders = columns.map(() => '?').join(',')
            const insertStmt = feedbackDb.prepare(`INSERT INTO "${tableName}" (${columns.join(',')}) VALUES (${placeholders})`)

            for (const row of rows) {
              insertStmt.run(...columns.map(col => (row as Record<string, unknown>)[col]))
            }
          }
        }
      }

      legacyDb.close()
      fs.unlinkSync(legacyDbPath)
      console.log('[DB] 反馈数据库迁移完成')
    } catch (error) {
      feedbackDb = openEncryptedDb(dbPath)
      if (!feedbackDb) {
        console.error('[DB] 无法打开反馈数据库，可能是密钥错误')
        feedbackDb = createEncryptedDb(dbPath)
      }
    }
  } else {
    feedbackDb = createEncryptedDb(dbPath)
  }

  if (!feedbackDb) {
    console.error('[DB] 反馈数据库初始化失败')
    return
  }

  feedbackDb.exec(`
    CREATE TABLE IF NOT EXISTS feedback_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prediction_id INTEGER,
      batch_id TEXT NOT NULL,
      source_field TEXT NOT NULL,
      predicted_result TEXT,
      actual_content TEXT,
      is_correct INTEGER DEFAULT 0,
      file_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_prediction_id ON feedback_records(prediction_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_batch_id ON feedback_records(batch_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_file_name ON feedback_records(file_name);
  `)
  console.log('加密反馈数据库已初始化:', dbPath)
}

function findAvailablePort(startPort: number, endPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number) => {
      if (port > endPort) {
        reject(new Error(`未找到 ${startPort}-${endPort} 范围内的可用端口`))
        return
      }
      const server = net.createServer()
      server.once('error', () => {
        server.close()
        tryPort(port + 1)
      })
      server.once('listening', () => {
        server.close(() => resolve(port))
      })
      server.listen(port)
    }
    tryPort(startPort)
  })
}

async function startPythonService() {
  const isDev = !app.isPackaged
  let pythonCmd: string
  let args: string[]
  let pythonCwd: string

  if (isDev) {
    // 开发模式：使用系统 Python
    const pythonServicePath = getPythonServicePath()
    pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
    args = [path.join(pythonServicePath, 'app.py')]
    pythonCwd = pythonServicePath
  } else {
    // 打包模式：使用 PyInstaller 生成的可执行文件
    pythonCmd = path.join(process.resourcesPath, 'python_service', 'app.exe')
    args = []
    pythonCwd = path.dirname(pythonCmd)
  }

  try {
    pythonServicePort = await findAvailablePort(5000, 5010)
  } catch (err) {
    console.error('端口检测失败:', err)
    pythonServicePort = 5000
  }

  console.log('启动 Python 服务:', pythonCmd, '端口:', pythonServicePort)

  // 读取 GPU 配置，传递给 Python 服务
  const gpuConfigPath = path.join(getConfigDir(), 'gpu_config.json')
  const gpuEnv: Record<string, string> = {}
  try {
    if (fs.existsSync(gpuConfigPath)) {
      const gpuConfig = JSON.parse(fs.readFileSync(gpuConfigPath, 'utf-8'))
      if (gpuConfig.cuda_visible_devices) {
        gpuEnv.CUDA_VISIBLE_DEVICES = gpuConfig.cuda_visible_devices
      }
      if (gpuConfig.device && gpuConfig.device !== 'auto') {
        gpuEnv.NAR_DEVICE = gpuConfig.device
      }
    }
  } catch (err) {
    console.warn('读取 GPU 配置失败:', err)
  }

  // 读取 Python 环境配置，设置外部 site-packages 路径
  let pythonPathEnv = isDev ? getPythonServicePath() : pythonCwd
  try {
    const pythonEnvConfigPath = path.join(getConfigDir(), 'python_env_config.json')
    if (fs.existsSync(pythonEnvConfigPath)) {
      const pythonEnvConfig = JSON.parse(fs.readFileSync(pythonEnvConfigPath, 'utf-8'))
      if (pythonEnvConfig.sitePackagesPath && fs.existsSync(pythonEnvConfig.sitePackagesPath)) {
        pythonPathEnv = pythonEnvConfig.sitePackagesPath + (process.platform === 'win32' ? ';' : ':') + pythonPathEnv
      }
    }
  } catch (err) {
    console.warn('读取 Python 环境配置失败:', err)
  }

  pythonProcess = spawn(pythonCmd, args, {
    cwd: pythonCwd,
    env: {
      ...process.env,
      PYTHONPATH: pythonPathEnv,
      PORT: String(pythonServicePort),
      CONFIG_DIR: getConfigDir(),
      MODEL_DIR: getModelsDir(),
      ...gpuEnv
    } as Record<string, string>
  })

  pythonProcess.stdout?.on('data', (data) => console.log(`Python: ${data}`))
  pythonProcess.stderr?.on('data', (data) => console.error(`Python Error: ${data}`))
  pythonProcess.on('close', (code) => console.log(`Python 服务退出，代码: ${code}`))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    title: '数据标注工具 v1.0',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      sandbox: true,
      experimentalFeatures: false,
      devTools: true
    },
    show: false
  })

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => mainWindow = null)

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '打开文件夹',
          accelerator: 'Ctrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow!, {
              title: '选择文件夹',
              properties: ['openDirectory']
            })
            if (!result.canceled && result.filePaths.length > 0) {
              const folderPath = result.filePaths[0]
              const tree = readDirectoryTree(folderPath)
              mainWindow?.webContents.send('folder-opened', { folderPath, tree })
            }
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: '导出',
      submenu: [
        {
          label: '反馈报告',
          click: async () => {
            try {
              if (!feedbackDb) {
                dialog.showErrorBox('错误', '反馈数据库未初始化')
                return
              }

              const rows = feedbackDb.prepare(
                'SELECT id, source_field, predicted_result, actual_content, created_at FROM feedback_records ORDER BY created_at DESC'
              ).all() as Array<{
                id: number
                source_field: string
                predicted_result: string
                actual_content: string
                created_at: string
              }>

              if (rows.length === 0) {
                dialog.showMessageBox(mainWindow!, {
                  type: 'info',
                  title: '导出反馈报告',
                  message: '暂无反馈记录可导出'
                })
                return
              }

              const now = new Date()
              const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`

              const result = await dialog.showSaveDialog(mainWindow!, {
                title: '导出反馈报告',
                defaultPath: `feedback_report_${timestamp}.xlsx`,
                filters: [
                  { name: 'Excel 文件', extensions: ['xlsx'] }
                ]
              })

              if (result.canceled || !result.filePath) return

              const excelData = [
                ['序号', '导出源字段', '预测值', '实际值', '时间'],
                ...rows.map(row => [
                  row.id,
                  row.source_field,
                  row.predicted_result,
                  row.actual_content,
                  row.created_at
                ])
              ]

              const worksheet = XLSX.utils.aoa_to_sheet(excelData)
              const workbook = XLSX.utils.book_new()
              XLSX.utils.book_append_sheet(workbook, worksheet, '反馈报告')

              const wbout = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
              fs.writeFileSync(result.filePath, wbout)

              dialog.showMessageBox(mainWindow!, {
                type: 'info',
                title: '导出成功',
                message: `已成功导出 ${rows.length} 条反馈记录`,
                detail: `保存路径: ${result.filePath}`
              })
            } catch (error) {
              console.error('导出反馈报告失败:', error)
              dialog.showErrorBox('导出失败', `导出反馈报告时发生错误: ${error}`)
            }
          }
        }
      ]
    },
    {
      label: '设置',
      submenu: [
        {
          label: '全局设置',
          click: () => {
            mainWindow?.webContents.send('open-settings')
          }
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '开发者工具',
          accelerator: process.platform === 'darwin' ? 'Cmd+Option+I' : 'F12',
          click: () => {
            mainWindow?.webContents.toggleDevTools()
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// ========== IPC 处理器 ==========

// 1. 选择文件
ipcMain.handle('select-excel-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择 Excel 文件',
    filters: [
      { name: 'Excel 文件', extensions: ['xlsx', 'xls'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, message: '用户取消选择' }
  }
  return { success: true, filePath: result.filePaths[0] }
})

/**
 * Excel读取结果接口
 * @property success - 是否成功
 * @property headers - 表头数组
 * @property rows - 数据行数组
 * @property sheetName - Sheet名称
 * @property sheetIndex - Sheet索引
 * @property message - 错误信息（失败时）
 */
interface ReadExcelResult {
  success: boolean
  headers?: string[]
  rows?: any[][]
  sheetName?: string
  sheetIndex?: number
  message?: string
}

/**
 * 读取Excel文件的公共函数
 * @param filePath - Excel文件路径
 * @param sheetIndex - Sheet索引，可选，默认读取第一个Sheet
 * @returns ReadExcelResult 读取结果对象
 * @throws 文件读取或解析失败时抛出错误
 */
function readExcelFile(filePath: string, sheetIndex?: number): ReadExcelResult {
  const buffer = fs.readFileSync(filePath)
  const workbook = XLSX.read(buffer, { type: 'buffer' })

  const targetSheetIndex = sheetIndex !== undefined ? sheetIndex : 0

  if (targetSheetIndex < 0 || targetSheetIndex >= workbook.SheetNames.length) {
    return { success: false, message: 'Sheet索引超出范围' }
  }

  const sheetName = workbook.SheetNames[targetSheetIndex]
  const worksheet = workbook.Sheets[sheetName]
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

  if (jsonData.length === 0) {
    return { success: false, message: sheetIndex !== undefined ? 'Sheet 为空' : 'Excel 文件为空' }
  }

  return {
    success: true,
    headers: jsonData[0] as string[],
    rows: jsonData.slice(1),
    sheetName,
    sheetIndex: targetSheetIndex
  }
}

// 2. 读取 Excel
ipcMain.handle('read-excel', async (_, filePath: string) => {
  try {
    const result = readExcelFile(filePath)
    if (!result.success) {
      return result
    }

    // 重新读取workbook以获取所有Sheet名称
    const buffer = fs.readFileSync(filePath)
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetNames = workbook.SheetNames

    return {
      ...result,
      sheetNames,
      fileName: path.basename(filePath)
    }
  } catch (error) {
    return { success: false, message: `读取失败: ${error}` }
  }
})

// 新增：按Sheet索引读取指定Sheet
ipcMain.handle('read-excel-sheet', async (_, filePath: string, sheetIndex: number) => {
  try {
    return readExcelFile(filePath, sheetIndex)
  } catch (error) {
    return { success: false, message: `读取Sheet失败: ${error}` }
  }
})

// 3. 保存 Excel（核心新增功能）
ipcMain.handle('save-excel', async (_, params: {
  filePath: string
  headers: string[]
  rows: any[][]
  mode: 'overwrite' | 'ask'
}) => {
  try {
    let savePath = params.filePath
    let fileName = path.basename(params.filePath)

    // 如果 mode 是 ask，弹出保存对话框
    if (params.mode === 'ask') {
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: '保存 Excel 文件',
        defaultPath: params.filePath,
        filters: [
          { name: 'Excel 文件', extensions: ['xlsx'] },
          { name: 'Excel 97-2003', extensions: ['xls'] }
        ]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, message: '用户取消保存' }
      }

      savePath = result.filePath
      fileName = path.basename(result.filePath)
    }

    // 构建 workbook
    const worksheet = XLSX.utils.aoa_to_sheet([params.headers, ...params.rows])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')

    // 使用 XLSX.write + fs.writeFileSync 替代 XLSX.writeFile
    // 原因：同上，Vite 打包后 xlsx 内部 _fs 不可用
    const wbout = XLSX.write(workbook, { type: 'buffer', bookType: savePath.endsWith('.xls') ? 'xls' : 'xlsx' })
    fs.writeFileSync(savePath, wbout)

    const isNewPath = savePath !== params.filePath

    return {
      success: true,
      filePath: savePath,
      fileName,
      newPath: isNewPath ? savePath : undefined
    }
  } catch (error) {
    console.error('保存 Excel 失败:', error)
    return { success: false, message: `保存失败: ${error}` }
  }
})

// 4. 调用推理
ipcMain.handle('run-inference', async (_, columnData: string[], columnName: string) => {
  try {
    const response = await fetch(`http://localhost:${pythonServicePort}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: columnData, column_name: columnName })
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const result = await response.json()
    return { success: true, result: result.results || result }
  } catch (error) {
    // 返回模拟数据
    return {
      success: true,
      result: columnData.map((item, index) => ({
        content: `识别结果-${index + 1}: ${item.substring(0, 20)}`,
        confidence: Math.random() * 0.4 + 0.5,
        alternatives: [
          { content: `备选-${index + 1}-A`, confidence: Math.random() * 0.3 + 0.2 },
          { content: `备选-${index + 1}-B`, confidence: Math.random() * 0.2 + 0.1 }
        ]
      })),
      isMock: true
    }
  }
})

// 5. 保存反馈
ipcMain.handle('save-feedback', async (_, feedback: any) => {
  try {
    if (!db) throw new Error('数据库未初始化')

    const stmt = db.prepare(`
      INSERT INTO feedback (input_text, model_output, confidence, user_confirm, corrected_value, column_name, file_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      feedback.inputText,
      feedback.modelOutput,
      feedback.confidence,
      feedback.userConfirm ? 1 : 0,
      feedback.correctedValue || null,
      feedback.columnName,
      feedback.fileName
    )

    return { success: true, id: result.lastInsertRowid }
  } catch (error) {
    return { success: false, message: `${error}` }
  }
})

// 6. 统计
ipcMain.handle('get-feedback-stats', async () => {
  try {
    if (!db) throw new Error('数据库未初始化')
    const total = db.prepare('SELECT COUNT(*) as count FROM feedback').get() as any
    const confirmed = db.prepare('SELECT COUNT(*) as count FROM feedback WHERE user_confirm = 1').get() as any
    const rejected = db.prepare('SELECT COUNT(*) as count FROM feedback WHERE user_confirm = 0').get() as any

    return {
      success: true,
      stats: { total: total.count, confirmed: confirmed.count, rejected: rejected.count }
    }
  } catch (error) {
    return { success: false, message: `${error}` }
  }
})

// 7. 导出
ipcMain.handle('export-feedback', async (_, format: 'json' | 'csv' = 'json') => {
  try {
    if (!db) throw new Error('数据库未初始化')
    const rows = db.prepare('SELECT * FROM feedback ORDER BY created_at DESC').all()

    const exportPath = path.join(app.getPath('downloads'), `feedback_export_${Date.now()}.${format}`)

    if (format === 'json') {
      fs.writeFileSync(exportPath, JSON.stringify(rows, null, 2), 'utf-8')
    } else {
      if (rows.length === 0) {
        fs.writeFileSync(exportPath, '', 'utf-8')
      } else {
        const columns = Object.keys(rows[0] as Record<string, unknown>)
        const headers = columns.join(',')
        const csvRows = rows.map((row: any) =>
          columns.map((col) => {
            const val = row[col] ?? ''
            const str = String(val).replace(/"/g, '""')
            return `"${str}"`
          }).join(',')
        )
        fs.writeFileSync(exportPath, [headers, ...csvRows].join('\n'), 'utf-8')
      }
    }

    return { success: true, exportPath }
  } catch (error) {
    return { success: false, message: `${error}` }
  }
})

// 8. 版本
ipcMain.handle('get-app-version', () => ({ version: app.getVersion() }))

// 9. 选择文件夹
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择文件夹',
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, message: '用户取消选择' }
  }
  return { success: true, folderPath: result.filePaths[0] }
})

// 10. 读取目录树
ipcMain.handle('read-directory-tree', async (_, folderPath: string) => {
  try {
    const tree = readDirectoryTree(folderPath)
    return { success: true, tree }
  } catch (error) {
    return { success: false, message: `读取目录失败: ${error}` }
  }
})

// ========== 流式预测相关 IPC 处理器 ==========

/**
 * 流式预测接口参数
 * @property data - 待预测的文本数组
 * @property k - 返回的候选结果数量，默认为 3
 */
interface PredictStreamParams {
  data: string[]
  k?: number
}

/**
 * 流式预测进度数据
 * @property index - 当前处理的索引
 * @property total - 总数据量
 * @property abbr - 原始输入值（单元格内容）
 * @property result - 当前预测结果
 */
interface PredictProgressData {
  index: number
  total: number
  abbr: string
  result: {
    content: string
    confidence: number
    alternatives?: Array<{ content: string; confidence: number }>
  }
}

/**
 * 流式预测完成数据
 * @property results - 所有预测结果数组
 * @property total - 总数据量
 * @property duration - 处理耗时（毫秒）
 */
interface PredictCompleteData {
  results: PredictProgressData['result'][]
  total: number
  duration: number
}

// 11. 流式预测 - 使用 SSE 接收流式响应
ipcMain.handle('predict-stream', async (event, params: PredictStreamParams) => {
  try {
    const { data, k = 3 } = params
    
    // 发起 SSE 请求到 Python 服务
    const response = await fetch(`http://localhost:${pythonServicePort}/predict_stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, k })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    // 获取响应体读取器
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法获取响应流读取器')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    const results: PredictProgressData['result'][] = []
    const startTime = Date.now()

    // 循环读取流数据
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 保留不完整的行到下一次处理

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine) continue

        // 解析 SSE 数据行 (格式: data: {...})
        if (trimmedLine.startsWith('data:')) {
          const jsonStr = trimmedLine.substring(5).trim()
          try {
            const sseData = JSON.parse(jsonStr)

            // 处理进度事件
            if (sseData.type === 'progress' && sseData.data) {
              const progressData: PredictProgressData = {
                index: sseData.data.index,
                total: sseData.data.total,
                abbr: sseData.data.abbr || '',
                result: {
                  content: sseData.data.result?.content || '',
                  confidence: sseData.data.result?.confidence || 0,
                  alternatives: sseData.data.result?.alternatives || []
                }
              }
              results.push(progressData.result)

              // 发送进度事件到渲染进程
              event.sender.send('predict-progress', progressData)
            }

            // 处理完成事件
            if (sseData.type === 'complete') {
              const completeData: PredictCompleteData = {
                results: results,
                total: results.length,
                duration: Date.now() - startTime
              }
              
              // 发送完成事件到渲染进程
              event.sender.send('predict-complete', completeData)
              return { success: true }
            }

            // 处理错误事件
            if (sseData.type === 'error') {
              throw new Error(sseData.message || '流式预测过程中发生错误')
            }
          } catch (parseError) {
            console.error('解析 SSE 数据失败:', parseError, '原始数据:', jsonStr)
          }
        }
      }
    }

    // 流结束但没有收到 complete 事件，手动发送完成
    const completeData: PredictCompleteData = {
      results: results,
      total: results.length,
      duration: Date.now() - startTime
    }
    event.sender.send('predict-complete', completeData)
    return { success: true }

  } catch (error) {
    console.error('流式预测失败:', error)
    // 发送错误事件到渲染进程
    event.sender.send('predict-error', { message: `${error}` })
    return { success: false, message: `${error}` }
  }
})

/**
 * 预测记录参数
 * @property batchId - 批次ID
 * @property sourceField - 源字段内容
 * @property predictedResult - 预测结果
 * @property confidence - 置信度
 * @property columnName - 列名
 * @property fileName - 文件名
 */
interface PredictionRecordParams {
  batchId: string
  sourceField: string
  predictedResult: string
  confidence: number
  columnName: string
  fileName: string
}

// 12. 保存预测记录
ipcMain.handle('save-prediction-record', async (_, record: PredictionRecordParams) => {
  try {
    if (!predictionDb) {
      throw new Error('预测数据库未初始化')
    }

    const stmt = predictionDb.prepare(`
      INSERT INTO prediction_records 
      (batch_id, source_field, predicted_result, confidence, column_name, file_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      record.batchId,
      record.sourceField,
      record.predictedResult,
      record.confidence,
      record.columnName,
      record.fileName
    )

    return { 
      success: true, 
      id: result.lastInsertRowid,
      message: '预测记录保存成功'
    }
  } catch (error) {
    console.error('保存预测记录失败:', error)
    return { 
      success: false, 
      message: `保存预测记录失败: ${error}` 
    }
  }
})

/**
 * 用户选择更新参数
 * @property id - 记录ID
 * @property userSelectedResult - 用户选择的结果
 */
interface UpdateUserSelectionParams {
  id: number
  userSelectedResult: string
}

// 13. 更新用户选择
ipcMain.handle('update-user-selection', async (_, params: UpdateUserSelectionParams) => {
  try {
    if (!predictionDb) {
      throw new Error('预测数据库未初始化')
    }

    const stmt = predictionDb.prepare(`
      UPDATE prediction_records 
      SET user_selected_result = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)

    const result = stmt.run(params.userSelectedResult, params.id)

    if (result.changes === 0) {
      return { 
        success: false, 
        message: '未找到指定的预测记录' 
      }
    }

    return { 
      success: true, 
      message: '用户选择更新成功' 
    }
  } catch (error) {
    console.error('更新用户选择失败:', error)
    return { 
      success: false, 
      message: `更新用户选择失败: ${error}` 
    }
  }
})

/**
 * 反馈记录参数
 * @property predictionId - 关联的预测记录ID
 * @property batchId - 批次ID
 * @property sourceField - 源字段内容
 * @property predictedResult - 预测结果
 * @property actualContent - 实际内容（用户确认的正确内容）
 * @property isCorrect - 预测是否正确
 * @property fileName - 文件名
 */
interface FeedbackRecordParams {
  predictionId?: number
  batchId: string
  sourceField: string
  predictedResult: string
  actualContent: string
  isCorrect: boolean
  fileName: string
}

// 14. 保存反馈记录
ipcMain.handle('save-feedback-record', async (_, record: FeedbackRecordParams) => {
  try {
    if (!feedbackDb) {
      throw new Error('反馈数据库未初始化')
    }

    const stmt = feedbackDb.prepare(`
      INSERT INTO feedback_records 
      (prediction_id, batch_id, source_field, predicted_result, actual_content, is_correct, file_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      record.predictionId || null,
      record.batchId,
      record.sourceField,
      record.predictedResult,
      record.actualContent,
      record.isCorrect ? 1 : 0,
      record.fileName
    )

    return { 
      success: true, 
      id: result.lastInsertRowid,
      message: '反馈记录保存成功'
    }
  } catch (error) {
    console.error('保存反馈记录失败:', error)
    return { 
      success: false, 
      message: `保存反馈记录失败: ${error}` 
    }
  }
})

/**
 * 获取预测记录参数
 * @property batchId - 可选的批次ID过滤条件
 */
interface GetPredictionRecordsParams {
  batchId?: string
}

// 15. 获取预测记录
ipcMain.handle('get-prediction-records', async (_, params: GetPredictionRecordsParams = {}) => {
  try {
    if (!predictionDb) {
      throw new Error('预测数据库未初始化')
    }

    let query = 'SELECT * FROM prediction_records'
    let countQuery = 'SELECT COUNT(*) as total FROM prediction_records'
    const queryParams: any[] = []

    // 如果指定了 batchId，添加过滤条件
    if (params.batchId) {
      query += ' WHERE batch_id = ?'
      countQuery += ' WHERE batch_id = ?'
      queryParams.push(params.batchId)
    }

    query += ' ORDER BY created_at DESC'

    // 获取总记录数
    const countResult = predictionDb.prepare(countQuery).get(...queryParams) as { total: number }

    // 获取记录列表
    const records = predictionDb.prepare(query).all(...queryParams)

    return {
      success: true,
      records: records,
      total: countResult.total,
      message: '获取预测记录成功'
    }
  } catch (error) {
    console.error('获取预测记录失败:', error)
    return {
      success: false,
      message: `获取预测记录失败: ${error}`
    }
  }
})

// ========== 数据库加密相关 IPC 处理器 ==========

/**
 * 数据库加密状态接口
 * @property isDebugMode - 是否为调试模式
 * @property isEncrypted - 数据库是否已加密
 * @property hasKey - 是否有可用的加密密钥
 */
interface EncryptionStatus {
  isDebugMode: boolean
  isEncrypted: boolean
  hasKey: boolean
}

// 16. 获取数据库加密状态
ipcMain.handle('get-encryption-status', async (): Promise<{ success: boolean; status?: EncryptionStatus; message?: string }> => {
  try {
    const encryption = getDbEncryption()
    const debugMode = encryption.checkDebugMode()
    const key = encryption.getEncryptionKey()

    // 检查数据库文件是否加密
    let isEncrypted = false
    const dbPaths = [
      path.join(app.getPath('userData'), 'feedback.db'),
      path.join(DATA_DIR, 'predictions.db'),
      path.join(DATA_DIR, 'feedback.db')
    ]

    for (const dbPath of dbPaths) {
      if (fs.existsSync(dbPath)) {
        try {
          const testDb = new Database(dbPath, { readonly: true })
          testDb.prepare('SELECT 1').get()
          testDb.close()
          // 如果能直接打开，说明是明文数据库
          isEncrypted = false
          break
        } catch {
          // 如果无法直接打开，可能是加密的
          isEncrypted = true
          break
        }
      }
    }

    return {
      success: true,
      status: {
        isDebugMode: debugMode,
        isEncrypted: isEncrypted,
        hasKey: key !== null
      }
    }
  } catch (error) {
    console.error('获取加密状态失败:', error)
    return {
      success: false,
      message: `获取加密状态失败: ${error}`
    }
  }
})

/**
 * 解密数据库参数
 * @property outputPath - 解密后的数据库输出路径
 */
interface DecryptDatabaseParams {
  outputPath: string
}

// 17. 解密数据库（仅调试模式可用）
ipcMain.handle('decrypt-database', async (_, params: DecryptDatabaseParams): Promise<{ success: boolean; message?: string; outputPath?: string }> => {
  try {
    const encryption = getDbEncryption()

    if (!encryption.checkDebugMode()) {
      return {
        success: false,
        message: '非调试模式无法解密数据库'
      }
    }

    const dbPath = path.join(DATA_DIR, 'predictions.db')
    if (!fs.existsSync(dbPath)) {
      return {
        success: false,
        message: '数据库文件不存在'
      }
    }

    const success = encryption.decryptDatabase(dbPath, params.outputPath)
    if (success) {
      return {
        success: true,
        message: '数据库解密成功',
        outputPath: params.outputPath
      }
    } else {
      return {
        success: false,
        message: '数据库解密失败'
      }
    }
  } catch (error) {
    console.error('解密数据库失败:', error)
    return {
      success: false,
      message: `解密数据库失败: ${error}`
    }
  }
})

// 18. 生成新的加密密钥（仅调试模式可用）
ipcMain.handle('generate-encryption-key', async (): Promise<{ success: boolean; key?: string; message?: string }> => {
  try {
    const encryption = getDbEncryption()

    if (!encryption.checkDebugMode()) {
      return {
        success: false,
        message: '非调试模式无法生成密钥'
      }
    }

    const newKey = encryption.generateRandomKey()
    return {
      success: true,
      key: newKey,
      message: '新密钥生成成功'
    }
  } catch (error) {
    console.error('生成密钥失败:', error)
    return {
      success: false,
      message: `生成密钥失败: ${error}`
    }
  }
})

// 19. 获取机器指纹信息（用于调试和验证）
ipcMain.handle('get-machine-fingerprint', async (): Promise<{ success: boolean; fingerprint?: any; message?: string }> => {
  try {
    const encryption = getDbEncryption()

    if (!encryption.checkDebugMode()) {
      return {
        success: false,
        message: '非调试模式无法获取机器指纹'
      }
    }

    const fingerprint = encryption.getMachineFingerprint()
    return {
      success: true,
      fingerprint: fingerprint,
      message: '机器指纹获取成功'
    }
  } catch (error) {
    console.error('获取机器指纹失败:', error)
    return {
      success: false,
      message: `获取机器指纹失败: ${error}`
    }
  }
})

// ========== 设置相关 IPC 处理器 ==========

/**
 * 读取 GPU 配置
 * @returns GPU 配置对象
 */
ipcMain.handle('read-gpu-config', async (): Promise<{ success: boolean; config?: any; message?: string }> => {
  try {
    const configPath = path.join(getConfigDir(), 'gpu_config.json')
    if (!fs.existsSync(configPath)) {
      return { success: true, config: { device: 'auto', cuda_visible_devices: '' } }
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return { success: true, config }
  } catch (error) {
    return { success: false, message: `读取 GPU 配置失败: ${error}` }
  }
})

/**
 * 保存 GPU 配置
 * @param _ - 事件对象
 * @param config - GPU 配置对象
 * @returns 保存结果
 */
ipcMain.handle('save-gpu-config', async (_, config: any): Promise<{ success: boolean; message?: string }> => {
  try {
    const configPath = path.join(getConfigDir(), 'gpu_config.json')
    const existingConfig = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      : {}
    const newConfig = {
      ...existingConfig,
      device: config.device ?? existingConfig.device ?? 'auto',
      cuda_visible_devices: config.cuda_visible_devices ?? existingConfig.cuda_visible_devices ?? ''
    }
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8')
    return { success: true, message: 'GPU 配置已保存，重启应用后生效' }
  } catch (error) {
    return { success: false, message: `保存 GPU 配置失败: ${error}` }
  }
})

/**
 * 读取过滤规则配置
 * @returns 过滤规则配置对象
 */
ipcMain.handle('read-filter-config', async (): Promise<{ success: boolean; config?: any; message?: string }> => {
  try {
    const configPath = path.join(getConfigDir(), 'filter_config.json')
    if (!fs.existsSync(configPath)) {
      return {
        success: true,
        config: {
          description: '缩写识别过滤配置',
          version: '1.0.0',
          rules: { exact_match: { description: '精确匹配替换规则', items: [] }, prefix_match: { description: '前缀匹配规则', prefixes: [] } }
        }
      }
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return { success: true, config }
  } catch (error) {
    return { success: false, message: `读取过滤规则配置失败: ${error}` }
  }
})

/**
 * 保存过滤规则配置
 * 保存后通知 Python 服务热重载配置
 * @param _ - 事件对象
 * @param config - 过滤规则配置对象
 * @returns 保存结果
 */
ipcMain.handle('save-filter-config', async (_, config: any): Promise<{ success: boolean; message?: string }> => {
  try {
    const configPath = path.join(getConfigDir(), 'filter_config.json')
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')

    // 通知 Python 服务重载配置
    try {
      const port = process.env.PORT || pythonServicePort || 5000
      const http = await import('http')
      await new Promise<void>((resolve, reject) => {
        const req = http.request(`http://127.0.0.1:${port}/api/reload-config`, { method: 'POST' }, (res) => {
          res.on('data', () => {})
          res.on('end', resolve)
        })
        req.on('error', reject)
        req.setTimeout(3000, () => { req.destroy(); reject(new Error('超时')) })
        req.end()
      })
    } catch (reloadErr) {
      console.warn('通知 Python 服务重载配置失败（服务可能未启动）:', reloadErr)
    }

    return { success: true, message: '过滤规则配置已保存并重载' }
  } catch (error) {
    return { success: false, message: `保存过滤规则配置失败: ${error}` }
  }
})

/**
 * 读取日志配置
 * @returns 日志配置对象
 */
ipcMain.handle('read-logging-config', async (): Promise<{ success: boolean; config?: any; message?: string }> => {
  try {
    const configPath = path.join(getConfigDir(), 'logging_config.json')
    if (!fs.existsSync(configPath)) {
      return { success: true, config: { level: 'INFO', log_dir: 'log', log_file: 'python_service.log', max_bytes: 1048576, backup_count: 5 } }
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return { success: true, config }
  } catch (error) {
    return { success: false, message: `读取日志配置失败: ${error}` }
  }
})

/**
 * 保存日志配置
 * @param _ - 事件对象
 * @param config - 日志配置对象
 * @returns 保存结果
 */
ipcMain.handle('save-logging-config', async (_, config: any): Promise<{ success: boolean; message?: string }> => {
  try {
    const configPath = path.join(getConfigDir(), 'logging_config.json')
    const existingConfig = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      : {}
    const newConfig = {
      ...existingConfig,
      level: config.level ?? existingConfig.level ?? 'INFO',
      log_dir: config.log_dir ?? existingConfig.log_dir ?? 'log',
      log_file: config.log_file ?? existingConfig.log_file ?? 'python_service.log',
      max_bytes: config.max_bytes ?? existingConfig.max_bytes ?? 1048576,
      backup_count: config.backup_count ?? existingConfig.backup_count ?? 5,
    }
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8')

    // 通知 Python 服务重载日志配置
    try {
      const port = process.env.PORT || pythonServicePort || 5000
      const http = await import('http')
      await new Promise<void>((resolve, reject) => {
        const req = http.request(`http://127.0.0.1:${port}/api/reload-logging-config`, { method: 'POST' }, (res) => {
          res.on('data', () => {})
          res.on('end', resolve)
        })
        req.on('error', reject)
        req.setTimeout(3000, () => { req.destroy(); reject(new Error('超时')) })
        req.end()
      })
    } catch (reloadErr) {
      console.warn('通知 Python 服务重载日志配置失败（服务可能未启动）:', reloadErr)
    }

    return { success: true, message: '日志配置已保存并生效' }
  } catch (error) {
    return { success: false, message: `保存日志配置失败: ${error}` }
  }
})

/**
 * 读取 Python 环境配置
 */
ipcMain.handle('read-python-env-config', async (): Promise<{ success: boolean; config?: any; message?: string }> => {
  try {
    const configPath = path.join(getConfigDir(), 'python_env_config.json')
    if (!fs.existsSync(configPath)) {
      return { success: true, config: { pythonPath: '', sitePackagesPath: '' } }
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return { success: true, config }
  } catch (error) {
    return { success: false, message: `读取 Python 环境配置失败: ${error}` }
  }
})

/**
 * 保存 Python 环境配置
 * @param _ - 事件对象
 * @param config - Python 环境配置对象
 * @returns 保存结果
 */
ipcMain.handle('save-python-env-config', async (_, config: any): Promise<{ success: boolean; message?: string }> => {
  try {
    const configPath = path.join(getConfigDir(), 'python_env_config.json')
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    return { success: true, message: 'Python 环境配置已保存，重启应用后生效' }
  } catch (error) {
    return { success: false, message: `保存 Python 环境配置失败: ${error}` }
  }
})

// ========== 应用生命周期 ==========

app.whenReady().then(async () => {
  initDatabase()
  // 确保数据目录存在并初始化新的数据库
  ensureDataDir()
  initPredictionDatabase()
  initFeedbackDatabase()
  await startPythonService()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (pythonProcess) { pythonProcess.kill(); pythonProcess = null }
  if (db) { db.close(); db = null }
  if (predictionDb) { predictionDb.close(); predictionDb = null }
  if (feedbackDb) { feedbackDb.close(); feedbackDb = null }
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (pythonProcess) pythonProcess.kill()
  if (db) db.close()
  if (predictionDb) predictionDb.close()
  if (feedbackDb) feedbackDb.close()
})
