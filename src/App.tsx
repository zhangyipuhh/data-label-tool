import { useState, useCallback, useEffect } from 'react'
import { FileSpreadsheet, Save, Edit3, AlertCircle, X } from 'lucide-react'
import DataTable from './components/DataTable'
import FileExplorer from './components/FileExplorer'

/** Excel 数据接口，DataTable 等组件依赖此接口 */
export interface ExcelData {
  headers: string[]
  rows: any[][]
  fileName: string
  sheetName: string
}

/** 文件树节点接口，用于目录树展示 */
export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
  isXlsx?: boolean
}

/** 单元格编辑信息，保留兼容 */
export interface CellEdit {
  rowIndex: number
  colIndex: number
  oldValue: string
  newValue: string
}

/** 检测是否在 Electron 环境中运行 */
const isElectron = (): boolean => !!window.electronAPI

function App() {
  /** Excel 数据 */
  const [excelData, setExcelData] = useState<ExcelData | null>(null)
  /** 当前文件路径 */
  const [currentFilePath, setCurrentFilePath] = useState('')
  /** 消息提示内容 */
  const [message, setMessage] = useState('')
  /** 是否有未保存的修改 */
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  /** 目录树数据 */
  const [directoryTree, setDirectoryTree] = useState<FileTreeNode[] | null>(null)
  /** 当前选中的 xlsx 文件路径 */
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  /** 当前打开的文件夹路径（保留供后续功能使用） */
  const [_folderPath, setFolderPath] = useState<string | null>(null)

  /**
   * 打开文件夹
   * 调用 electronAPI 选择文件夹并读取目录树
   */
  const handleOpenFolder = useCallback(async (folderPath?: string, tree?: FileTreeNode[]) => {
    if (!isElectron()) {
      setMessage('❌ 请通过 Electron 启动应用 (npm run dev)')
      return
    }
    try {
      if (folderPath && tree) {
        setFolderPath(folderPath)
        setDirectoryTree(tree)
        setMessage(`✅ 已打开文件夹: ${folderPath}`)
        return
      }
      const result = await window.electronAPI.selectFolder()
      if (!result.success) {
        setMessage(result.message || '选择文件夹失败')
        return
      }
      setFolderPath(result.folderPath)
      // 读取目录树
      const treeResult = await window.electronAPI.readDirectoryTree(result.folderPath)
      if (treeResult.success) {
        setDirectoryTree(treeResult.tree)
        setMessage(`✅ 已打开文件夹: ${result.folderPath}`)
      } else {
        setMessage(`❌ 读取目录失败: ${treeResult.message}`)
      }
    } catch (error) {
      setMessage(`❌ 错误: ${error}`)
    }
  }, [])

  /**
   * 从文件浏览器选择 xlsx 文件
   * @param filePath - 选中的文件路径
   */
  const handleFileSelect = useCallback(async (filePath: string) => {
    if (!isElectron()) {
      setMessage('❌ 请通过 Electron 启动应用 (npm run dev)')
      return
    }
    try {
      setSelectedFilePath(filePath)
      const readResult = await window.electronAPI.readExcel(filePath)
      if (!readResult.success) {
        setMessage(readResult.message || '读取文件失败')
        return
      }
      setExcelData({
        headers: readResult.headers,
        rows: readResult.rows,
        fileName: readResult.fileName,
        sheetName: readResult.sheetName
      })
      setCurrentFilePath(filePath)
      setHasUnsavedChanges(false)
      setMessage(`✅ 成功加载: ${readResult.fileName} (${readResult.rows.length} 行 × ${readResult.headers.length} 列)`)
    } catch (error) {
      setMessage(`❌ 错误: ${error}`)
    }
  }, [])

  /**
   * 单元格编辑处理
   * @param rowIndex - 行索引
   * @param colIndex - 列索引
   * @param newValue - 新值
   */
  const handleCellEdit = useCallback((rowIndex: number, colIndex: number, newValue: string) => {
    if (!excelData) return

    const oldValue = String(excelData.rows[rowIndex]?.[colIndex] || '')
    if (oldValue === newValue) return

    const newRows = excelData.rows.map((row, rIdx) => {
      if (rIdx === rowIndex) {
        const newRow = [...row]
        newRow[colIndex] = newValue
        return newRow
      }
      return row
    })

    setExcelData({ ...excelData, rows: newRows })
    setHasUnsavedChanges(true)
    setMessage(`✏️ 已修改 [${rowIndex + 1}行, ${excelData.headers[colIndex] || `列${colIndex + 1}`}]`)
  }, [excelData])

  /**
   * 另存为文件
   * 弹出对话框让用户选择保存方式
   */
  const handleSave = useCallback(async () => {
    if (!excelData || !currentFilePath) {
      setMessage('❌ 没有可保存的数据')
      return
    }
    if (!isElectron()) {
      setMessage('❌ 请通过 Electron 启动应用 (npm run dev)')
      return
    }

    try {
      // 询问保存方式：覆盖原文件 / 另存为
      const result = await window.electronAPI.saveExcel({
        filePath: currentFilePath,
        headers: excelData.headers,
        rows: excelData.rows,
        mode: 'ask'  // 让用户选择覆盖或另存
      })

      if (result.success) {
        setHasUnsavedChanges(false)
        if (result.newPath) {
          setCurrentFilePath(result.newPath)
          setExcelData({ ...excelData, fileName: result.fileName || excelData.fileName })
        }
        setMessage(`✅ 已保存: ${result.filePath}`)
      } else {
        setMessage(`❌ 保存失败: ${result.message}`)
      }
    } catch (error) {
      setMessage(`❌ 保存错误: ${error}`)
    }
  }, [excelData, currentFilePath])

  /**
   * 快捷保存（直接覆盖原文件）
   * 绑定 Ctrl+S 快捷键
   */
  const handleQuickSave = useCallback(async () => {
    if (!excelData || !currentFilePath) return
    if (!isElectron()) {
      setMessage('❌ 请通过 Electron 启动应用 (npm run dev)')
      return
    }

    try {
      const result = await window.electronAPI.saveExcel({
        filePath: currentFilePath,
        headers: excelData.headers,
        rows: excelData.rows,
        mode: 'overwrite'
      })

      if (result.success) {
        setHasUnsavedChanges(false)
        setMessage('✅ 已保存到原文件')
      } else {
        setMessage(`❌ 保存失败: ${result.message}`)
      }
    } catch (error) {
      setMessage(`❌ 保存错误: ${error}`)
    }
  }, [excelData, currentFilePath])

  // 监听主进程系统菜单触发的打开文件夹事件
  useEffect(() => {
    if (!isElectron()) return
    const callback = (data: { folderPath: string; tree: FileTreeNode[] }) => {
      handleOpenFolder(data.folderPath, data.tree)
    }
    window.electronAPI.onFolderOpened(callback)
    // ipcRenderer.on 不需要手动移除，通道随页面生命周期管理
  }, [handleOpenFolder])

  // 快捷键绑定：仅保留 Ctrl+S 保存
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        if (hasUnsavedChanges) handleQuickSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleQuickSave, hasUnsavedChanges])

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* 消息提示 */}
      {message && (
        <div className={`px-4 py-2 flex items-center gap-2 text-sm ${
          message.includes('❌') ? 'bg-red-50 text-red-700' :
          message.includes('⚠️') ? 'bg-yellow-50 text-yellow-700' :
          'bg-green-50 text-green-700'
        }`}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{message}</span>
          <button onClick={() => setMessage('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* 主内容区：左右分栏 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：文件浏览器 */}
        <div className="w-[40%] min-w-[200px]">
          <FileExplorer tree={directoryTree} selectedFilePath={selectedFilePath} onFileSelect={handleFileSelect} />
        </div>

        {/* 右侧：Excel 数据展示区 */}
        <div className="flex-[3] bg-white overflow-auto">
          {/* 工具栏 - 保存按钮 */}
          {excelData && (
            <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-2 bg-gray-50">
              <button onClick={handleQuickSave} disabled={!hasUnsavedChanges}
                className="btn-success flex items-center gap-1 text-sm px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                <Save className="w-4 h-4" /> 保存 (Ctrl+S)
              </button>
              <button onClick={handleSave} className="btn-secondary flex items-center gap-1 text-sm px-3 py-1.5">
                <Edit3 className="w-4 h-4" /> 另存为...
              </button>
              <span className="text-sm text-gray-500 ml-2">
                {excelData.fileName} | {excelData.rows.length} 行 × {excelData.headers.length} 列
              </span>
              {hasUnsavedChanges && (
                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full font-medium">未保存</span>
              )}
            </div>
          )}

          {/* 数据表格或空状态 */}
          {excelData ? (
            <div className="p-4">
              <DataTable data={excelData} selectedColumn={null} onColumnSelect={() => {}} onCellEdit={handleCellEdit} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <FileSpreadsheet className="w-16 h-16 mx-auto mb-4" />
                <p className="text-lg">请从左侧选择 xlsx 文件</p>
                <p className="text-sm mt-1">点击文件浏览器中的 xlsx 文件即可查看</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
