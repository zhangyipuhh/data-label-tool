import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import path from 'path'
import * as XLSX from 'xlsx'
import Database from 'better-sqlite3'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import net from 'net'

let mainWindow: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null
let db: Database.Database | null = null
let pythonServicePort: number = 5000

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

function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'feedback.db')
  db = new Database(dbPath)

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
  console.log('数据库已初始化:', dbPath)
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
  const pythonServicePath = getPythonServicePath()
  const appPyPath = path.join(pythonServicePath, 'app.py')
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'

  try {
    pythonServicePort = await findAvailablePort(5000, 5010)
  } catch (err) {
    console.error('端口检测失败:', err)
    pythonServicePort = 5000
  }

  console.log('启动 Python 服务:', appPyPath, '端口:', pythonServicePort)

  pythonProcess = spawn(pythonCmd, [appPyPath], {
    cwd: pythonServicePath,
    env: { ...process.env, PYTHONPATH: pythonServicePath, PORT: String(pythonServicePort) }
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
      nodeIntegration: false
    },
    show: false
  })

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
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

// 2. 读取 Excel
ipcMain.handle('read-excel', async (_, filePath: string) => {
  try {
    // 使用 fs.readFileSync + XLSX.read 替代 XLSX.readFile
    // 原因：Vite 打包时将 xlsx 内联，导致 xlsx 内部的 _fs (require('fs')) 被移除
    const buffer = fs.readFileSync(filePath)
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

    if (jsonData.length === 0) {
      return { success: false, message: 'Excel 文件为空' }
    }

    return {
      success: true,
      headers: jsonData[0] as string[],
      rows: jsonData.slice(1),
      sheetName,
      fileName: path.basename(filePath)
    }
  } catch (error) {
    return { success: false, message: `读取失败: ${error}` }
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

// ========== 应用生命周期 ==========

app.whenReady().then(async () => {
  initDatabase()
  await startPythonService()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (pythonProcess) { pythonProcess.kill(); pythonProcess = null }
  if (db) { db.close(); db = null }
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (pythonProcess) pythonProcess.kill()
  if (db) db.close()
})
