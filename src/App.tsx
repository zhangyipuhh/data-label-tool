import { useState, useCallback, useEffect, useRef } from 'react'
import { FileSpreadsheet, Save, Edit3, AlertCircle, X } from 'lucide-react'
import DataTable from './components/DataTable'
import FileExplorer from './components/FileExplorer'
import ProgressBar from './components/ProgressBar'
import PredictionPanel, { PredictionResult } from './components/PredictionPanel'
import FeedbackModal from './components/FeedbackModal'
import SettingsModal from './components/SettingsModal'
import ResizableDivider from './components/ResizableDivider'
import ExcelTabs, { ExcelTab } from './components/ExcelTabs'
import CloseTabConfirmDialog from './components/CloseTabConfirmDialog'
import { savePrediction, getPrediction, cleanupOldPredictions } from './utils/predictionStorage'

/** Excel 数据接口，DataTable 等组件依赖此接口 */
export interface ExcelData {
  headers: string[]
  rows: any[][]
  fileName: string
  sheetName: string
  sheetIndex: number  // 新增：当前Sheet在文件中的索引
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

/** 预测记录映射接口，用于存储预测记录ID */
interface PredictionRecordMap {
  [index: number]: number
}

  /** 检测是否在 Electron 环境中运行 */
  const isElectron = (): boolean => !!window.electronAPI

  /**
   * 格式化错误信息
   * 将 Error 对象转换为字符串，避免显示 [object Object]
   * @param error - 错误对象或字符串
   * @returns 格式化后的错误信息字符串
   */
  const formatError = (error: unknown): string => {
    return error instanceof Error ? error.message : String(error)
  }

  function App() {
  /** Tab列表，最多5个 */
  const [tabs, setTabs] = useState<ExcelTab[]>([])
  /** 当前激活的Tab ID */
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  /** 消息提示内容 */
  const [message, setMessage] = useState('')
  /** 目录树数据 */
  const [directoryTree, setDirectoryTree] = useState<FileTreeNode[] | null>(null)
  /** 当前选中的 xlsx 文件路径 */
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  /** 当前打开的文件夹路径（保留供后续功能使用） */
  const [_folderPath, setFolderPath] = useState<string | null>(null)
  /** 左侧资源管理器是否折叠 */
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  /** 左侧资源管理器宽度（像素），默认 280px，从 localStorage 恢复 */
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth')
    return saved ? parseInt(saved, 10) : 280
  })
  /** 左侧栏最小宽度 */
  const SIDEBAR_MIN_WIDTH = 200
  /** 左侧栏最大宽度 */
  const SIDEBAR_MAX_WIDTH = 600

  /** 关闭确认对话框状态 */
  const [closeConfirmVisible, setCloseConfirmVisible] = useState(false)
  const [closeConfirmTabId, setCloseConfirmTabId] = useState<string | null>(null)

  // 辅助：获取当前激活的Tab
  const activeTab = tabs.find(tab => tab.id === activeTabId) || null
  // 辅助：获取当前Excel数据
  const excelData = activeTab?.excelData ?? null
  // 辅助：检查是否有未保存的更改
  const hasUnsavedChanges = activeTab?.hasUnsavedChanges ?? false

  // ========== 预测相关状态 ==========
  /** 是否正在预测中 */
  const [isPredicting, setIsPredicting] = useState(false)
  /** 预测进度百分比（0-100） */
  const [predictionProgress, setPredictionProgress] = useState(0)
  /** 当前已处理的预测数量 */
  const [predictionCurrent, setPredictionCurrent] = useState(0)
  /** 预测总数 */
  const [predictionTotal, setPredictionTotal] = useState(0)
  /** 当前正在预测的Tab ID */
  const [predictingTabId, setPredictingTabId] = useState<string | null>(null)
  /** 预测记录ID映射（用于后续更新用户选择） */
  const predictionRecordIds = useRef<PredictionRecordMap>({})
  /** 当前预测的源字段列表（用于关联预测结果和原始输入） */
  const currentPredictionSourceFields = useRef<string[]>([])

  // 辅助：获取当前激活Tab的预测面板状态（仅当激活Tab有预测面板时才显示）
  const activePredictionTab = tabs.find(tab => tab.id === activeTabId && tab.showPredictionPanel) || null

  // ========== 反馈弹窗状态 ==========
  /** 反馈弹窗是否可见 */
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false)
  /** 反馈弹窗数据 */
  const [feedbackModalData, setFeedbackModalData] = useState({
    sourceField: '',
    predictedResult: '',
    index: 0
  })
  /** 全局设置面板是否可见 */
  const [settingsVisible, setSettingsVisible] = useState(false)

  /**
   * 生成唯一批次ID
   * 使用时间戳和随机数组合
   * @returns 批次ID字符串
   */
  const generateBatchId = (): string => {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 处理拖拽分隔条调整左侧栏宽度
   * 限制在最小和最大宽度范围内
   * @param delta - 拖拽的像素差值
   */
  const handleSidebarResize = useCallback(
    (delta: number) => {
      setSidebarWidth((prev) => {
        const newWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, prev + delta))
        localStorage.setItem('sidebarWidth', String(newWidth))
        return newWidth
      })
    },
    []
  )

  /**
   * 双击分隔条折叠/展开左侧栏
   */
  const handleDividerDoubleClick = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev)
  }, [])

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
      if (!result.success || !result.folderPath) {
        setMessage(result.message || '选择文件夹失败')
        return
      }
      setFolderPath(result.folderPath)
      // 读取目录树
      const treeResult = await window.electronAPI.readDirectoryTree(result.folderPath)
      if (treeResult.success) {
        setDirectoryTree(treeResult.tree || null)
        setMessage(`✅ 已打开文件夹: ${result.folderPath}`)
      } else {
        setMessage(`❌ 读取目录失败: ${treeResult.message}`)
      }
    } catch (error) {
      const errorMessage = formatError(error)
      setMessage(`❌ 错误: ${errorMessage}`)
    }
  }, [])

  /**
   * 处理文件选择
   * 如果文件已打开则切换到对应Tab，否则创建新Tab
   * @param filePath - 选中的文件路径
   */
  const handleFileSelect = useCallback(async (filePath: string) => {
    if (!isElectron()) {
      setMessage('❌ 请通过 Electron 启动应用 (npm run dev)')
      return
    }

    try {
      // 1. 检查文件是否已打开
      const existingTab = tabs.find(tab => tab.filePath === filePath)
      if (existingTab) {
        setActiveTabId(existingTab.id)
        setSelectedFilePath(filePath)
        return
      }

      // 2. 检查Tab数量限制
      if (tabs.length >= 5) {
        setMessage('⚠️ 最多只能打开5个文件，请先关闭其他文件')
        return
      }

      // 3. 读取Excel文件
      setSelectedFilePath(filePath)
      const readResult = await window.electronAPI.readExcel(filePath)
      if (!readResult.success) {
        setMessage(readResult.message || '读取文件失败')
        return
      }

      // 4. 尝试从localStorage恢复预测数据
      const savedPrediction = getPrediction(filePath)

      // 5. 创建新Tab
      const newTab: ExcelTab = {
        id: filePath,
        filePath,
        fileName: readResult.fileName,
        sheets: readResult.sheetNames,
        activeSheetIndex: 0,
        excelData: {
          headers: readResult.headers,
          rows: readResult.rows,
          fileName: readResult.fileName,
          sheetName: readResult.sheetName,
          sheetIndex: 0
        },
        hasUnsavedChanges: false,
        selectedColumn: null,
        predictionResults: savedPrediction?.predictionResults || [],
        showPredictionPanel: savedPrediction?.showPredictionPanel || false,
        selectedPredictionColumn: savedPrediction?.selectedPredictionColumn ?? null,
        currentBatchId: savedPrediction?.currentBatchId || ''
      }

      setTabs(prev => [...prev, newTab])
      setActiveTabId(newTab.id)
      setMessage(`✅ 成功加载: ${readResult.fileName} (${readResult.rows.length} 行 × ${readResult.headers.length} 列)`)
    } catch (error) {
      const errorMessage = formatError(error)
      setMessage(`❌ 错误: ${errorMessage}`)
    }
  }, [tabs])

  /**
   * 处理Tab切换
   * 切换时如果新Tab有预测结果，自动显示其预测面板
   * @param tabId - 要切换到的Tab ID
   */
  const handleTabSelect = useCallback((tabId: string) => {
    setActiveTabId(tabId)
    const tab = tabs.find(t => t.id === tabId)
    if (tab) {
      setSelectedFilePath(tab.filePath)
    }
  }, [tabs])

  /**
   * 切换Sheet
   * 读取指定Sheet的数据并更新当前Tab
   * @param tabId - Tab ID
   * @param sheetIndex - Sheet索引
   */
  const handleSheetChange = useCallback(async (tabId: string, sheetIndex: number) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab || tab.activeSheetIndex === sheetIndex) return

    try {
      const result = await window.electronAPI.readExcelSheet(tab.filePath, sheetIndex)
      if (!result.success) {
        setMessage(result.message || '切换Sheet失败')
        return
      }

      setTabs(prev => prev.map(t => {
        if (t.id === tabId) {
          return {
            ...t,
            activeSheetIndex: sheetIndex,
            excelData: {
              headers: result.headers,
              rows: result.rows,
              fileName: t.fileName,
              sheetName: result.sheetName,
              sheetIndex
            },
            selectedColumn: null  // 切换Sheet后重置列选择
          }
        }
        return t
      }))
    } catch (error) {
      const errorMessage = formatError(error)
      setMessage(`❌ 切换Sheet错误: ${errorMessage}`)
    }
  }, [tabs])

  /**
   * 关闭Tab
   * 如果有未保存的更改，显示确认对话框
   * @param tabId - 要关闭的Tab ID
   */
  const handleCloseTab = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return

    if (tab.hasUnsavedChanges) {
      setCloseConfirmTabId(tabId)
      setCloseConfirmVisible(true)
    } else {
      closeTab(tabId)
    }
  }, [tabs])

  /**
   * 实际执行关闭Tab操作
   * @param tabId - 要关闭的Tab ID
   */
  const closeTab = (tabId: string) => {
    // 保存该Tab的预测数据到localStorage
    const tabToClose = tabs.find(t => t.id === tabId)
    if (tabToClose) {
      savePrediction(tabToClose.filePath, {
        predictionResults: tabToClose.predictionResults,
        selectedPredictionColumn: tabToClose.selectedPredictionColumn,
        currentBatchId: tabToClose.currentBatchId,
        showPredictionPanel: tabToClose.showPredictionPanel
      })
    }

    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== tabId)
      // 如果关闭的是当前激活的Tab，切换到相邻Tab
      if (activeTabId === tabId) {
        const closedIndex = prev.findIndex(t => t.id === tabId)
        const newActiveTab = newTabs[Math.min(closedIndex, newTabs.length - 1)]
        setActiveTabId(newActiveTab?.id ?? null)
        setSelectedFilePath(newActiveTab?.filePath ?? null)
      }
      return newTabs
    })
    setCloseConfirmVisible(false)
    setCloseConfirmTabId(null)
  }

  /**
   * 确认关闭Tab并保存
   * 保存成功后才会关闭Tab，保存失败则保持Tab打开并显示错误信息
   */
  const handleCloseConfirmSave = useCallback(async () => {
    if (!closeConfirmTabId) return
    const tab = tabs.find(t => t.id === closeConfirmTabId)
    if (!tab) return

    try {
      const result = await window.electronAPI.saveExcel({
        filePath: tab.filePath,
        headers: tab.excelData.headers,
        rows: tab.excelData.rows,
        mode: 'overwrite'
      })

      if (result.success) {
        setTabs(prev => prev.map(t =>
          t.id === closeConfirmTabId ? { ...t, hasUnsavedChanges: false } : t
        ))
        closeTab(closeConfirmTabId)
      } else {
        setMessage(`❌ 保存失败: ${result.message}`)
      }
    } catch (error) {
      const errorMessage = formatError(error)
      setMessage(`❌ 保存错误: ${errorMessage}`)
    }
  }, [closeConfirmTabId, tabs])

  /**
   * 确认关闭Tab但不保存
   */
  const handleCloseConfirmDiscard = useCallback(() => {
    if (!closeConfirmTabId) return
    closeTab(closeConfirmTabId)
  }, [closeConfirmTabId])

  /**
   * 取消关闭Tab
   */
  const handleCloseConfirmCancel = useCallback(() => {
    setCloseConfirmVisible(false)
    setCloseConfirmTabId(null)
  }, [])

  /**
   * 单元格编辑处理
   * 更新当前激活Tab的对应单元格数据
   * @param rowIndex - 行索引
   * @param colIndex - 列索引
   * @param newValue - 新值
   */
  const handleCellEdit = useCallback((rowIndex: number, colIndex: number, newValue: string) => {
    if (!activeTab || !activeTabId) return

    const oldValue = String(activeTab.excelData.rows[rowIndex]?.[colIndex] ?? '')
    if (oldValue === newValue) return

    const newRows = activeTab.excelData.rows.map((row, rIdx) => {
      if (rIdx === rowIndex) {
        const newRow = [...row]
        newRow[colIndex] = newValue
        return newRow
      }
      return row
    })

    setTabs(prev => prev.map(tab => {
      if (tab.id === activeTabId) {
        return {
          ...tab,
          excelData: { ...tab.excelData, rows: newRows },
          hasUnsavedChanges: true
        }
      }
      return tab
    }))

    setMessage(`✏️ 已修改 [${rowIndex + 1}行, ${activeTab.excelData.headers[colIndex] || `列${colIndex + 1}`}]`)
  }, [activeTab, activeTabId])

  /**
   * 另存为文件
   * 弹出对话框让用户选择保存方式
   * @param tabId - 可选，指定要保存的Tab，默认保存当前激活Tab
   */
  const handleSave = useCallback(async (tabId?: string) => {
    const targetTabId = tabId || activeTabId
    const tab = tabs.find(t => t.id === targetTabId)
    if (!tab) {
      setMessage('❌ 没有可保存的数据')
      return
    }
    if (!isElectron()) {
      setMessage('❌ 请通过 Electron 启动应用 (npm run dev)')
      return
    }

    try {
      const result = await window.electronAPI.saveExcel({
        filePath: tab.filePath,
        headers: tab.excelData.headers,
        rows: tab.excelData.rows,
        mode: 'ask'  // 让用户选择覆盖或另存
      })

      if (result.success) {
        setTabs(prev => prev.map(t => {
          if (t.id === targetTabId) {
            return {
              ...t,
              hasUnsavedChanges: false,
              filePath: result.newPath || t.filePath,
              fileName: result.fileName || t.fileName
            }
          }
          return t
        }))
        setMessage(`✅ 已保存: ${result.filePath}`)
      } else {
        setMessage(`❌ 保存失败: ${result.message}`)
      }
    } catch (error) {
      const errorMessage = formatError(error)
      setMessage(`❌ 保存错误: ${errorMessage}`)
    }
  }, [activeTabId, tabs])

  /**
   * 快捷保存（直接覆盖原文件）
   * 绑定 Ctrl+S 快捷键
   * @param tabId - 可选，指定要保存的Tab
   */
  const handleQuickSave = useCallback(async (tabId?: string) => {
    const targetTabId = tabId || activeTabId
    const tab = tabs.find(t => t.id === targetTabId)
    if (!tab) return
    if (!isElectron()) {
      setMessage('❌ 请通过 Electron 启动应用 (npm run dev)')
      return
    }

    try {
      const result = await window.electronAPI.saveExcel({
        filePath: tab.filePath,
        headers: tab.excelData.headers,
        rows: tab.excelData.rows,
        mode: 'overwrite'
      })

      if (result.success) {
        setTabs(prev => prev.map(t => {
          if (t.id === targetTabId) {
            return { ...t, hasUnsavedChanges: false }
          }
          return t
        }))
        setMessage('✅ 已保存到原文件')
      } else {
        setMessage(`❌ 保存失败: ${result.message}`)
      }
    } catch (error) {
      const errorMessage = formatError(error)
      setMessage(`❌ 保存错误: ${errorMessage}`)
    }
  }, [activeTabId, tabs])

  // ========== 预测功能 ==========

  /**
   * 处理列预测
   * 收集选中列的所有唯一值，发起流式预测请求
   * @param columnIndex - 要预测的列索引
   */
  const handleColumnPredict = useCallback(async (columnIndex: number) => {
    if (!isElectron()) {
      setMessage('❌ 请通过 Electron 启动应用 (npm run dev)')
      return
    }
    if (!activeTab || !activeTabId) {
      setMessage('❌ 请先加载数据文件')
      return
    }

    try {
      // 收集选中列的所有唯一值（非空）
      const columnValues: string[] = []
      const uniqueValues = new Set<string>()
      
      activeTab.excelData.rows.forEach(row => {
        const value = String(row[columnIndex] ?? '').trim()
        if (value && !uniqueValues.has(value)) {
          uniqueValues.add(value)
          columnValues.push(value)
        }
      })

      if (columnValues.length === 0) {
        setMessage('❌ 选中列没有有效数据')
        return
      }

      // 生成批次ID
      const batchId = generateBatchId()
      
      // 将预测状态保存到当前Tab
      setTabs(prev => prev.map(tab => {
        if (tab.id === activeTabId) {
          return {
            ...tab,
            currentBatchId: batchId,
            selectedPredictionColumn: columnIndex,
            predictionResults: [],
            showPredictionPanel: false
          }
        }
        return tab
      }))
      
      // 设置当前正在预测的Tab
      setPredictingTabId(activeTabId)
      
      // 重置预测状态
      setIsPredicting(true)
      setPredictionProgress(0)
      setPredictionCurrent(0)
      setPredictionTotal(columnValues.length)
      predictionRecordIds.current = {}
      // 保存源字段列表，用于后续关联预测结果
      currentPredictionSourceFields.current = columnValues

      setMessage(`🚀 开始预测列 "${activeTab.excelData.headers[columnIndex] || `列${columnIndex + 1}`}"，共 ${columnValues.length} 个唯一值`)

      // 启动流式预测
      await window.electronAPI.predictStream(columnValues, 3)
    } catch (error) {
      setIsPredicting(false)
      setPredictingTabId(null)
      const errorMessage = formatError(error)
      setMessage(`❌ 预测启动失败: ${errorMessage}`)
    }
  }, [activeTab, activeTabId])

  /**
   * 处理预测进度事件
   * 更新进度条，保存预测记录到数据库
   * @param data - 进度数据
   */
  const handlePredictProgress = useCallback(async (data: {
    index: number
    total: number
    abbr: string
    result: {
      content: string
      confidence: number
      alternatives?: Array<{ content: string; confidence: number }>
    }
  }) => {
    // 更新进度
    const progress = ((data.index + 1) / data.total) * 100
    setPredictionProgress(progress)
    setPredictionCurrent(data.index + 1)
    setPredictionTotal(data.total)

    // 获取当前索引对应的源字段（原始输入值）
    const sourceField = data.abbr || data.result.content

    // 构建预测结果对象
    const predictionResult: PredictionResult = {
      sourceField: sourceField,
      content: data.result.content,
      confidence: data.result.confidence,
      alternatives: data.result.alternatives || []
    }

    // 将预测结果添加到当前正在预测的Tab中
    if (predictingTabId) {
      setTabs(prev => prev.map(tab => {
        if (tab.id === predictingTabId) {
          return {
            ...tab,
            predictionResults: [...tab.predictionResults, predictionResult]
          }
        }
        return tab
      }))
    }

    // 保存预测记录到数据库
    const predictingTab = tabs.find(t => t.id === predictingTabId)
    if (predictingTab && predictingTab.selectedPredictionColumn !== null) {
      try {
        const result = await window.electronAPI.savePredictionRecord({
          batchId: predictingTab.currentBatchId,
          sourceField: sourceField,
          predictedResult: data.result.content,
          confidence: data.result.confidence,
          columnName: predictingTab.excelData.headers[predictingTab.selectedPredictionColumn] || `列${predictingTab.selectedPredictionColumn + 1}`,
          fileName: predictingTab.excelData.fileName
        })

        if (result.success && result.id) {
          // 保存记录ID，用于后续更新用户选择
          predictionRecordIds.current[data.index] = result.id
        }
      } catch (error) {
        console.error('保存预测记录失败:', error)
      }
    }
  }, [predictingTabId, tabs])

  /**
   * 处理预测完成事件
   * 完成预测，显示结果面板
   * @param data - 完成数据
   */
  const handlePredictComplete = useCallback((data: {
    results: Array<{
      content: string
      confidence: number
      alternatives?: Array<{ content: string; confidence: number }>
    }>
    total: number
    duration: number
  }) => {
    setIsPredicting(false)
    setPredictionProgress(100)
    
    // 显示当前正在预测的Tab的预测面板，并保存预测数据
    if (predictingTabId) {
      setTabs(prev => {
        const updatedTabs = prev.map(tab => {
          if (tab.id === predictingTabId) {
            const updatedTab = {
              ...tab,
              showPredictionPanel: true
            }
            // 保存预测数据到localStorage
            savePrediction(tab.filePath, {
              predictionResults: updatedTab.predictionResults,
              selectedPredictionColumn: updatedTab.selectedPredictionColumn,
              currentBatchId: updatedTab.currentBatchId,
              showPredictionPanel: true
            })
            return updatedTab
          }
          return tab
        })
        return updatedTabs
      })
    }
    
    setPredictingTabId(null)
    setMessage(`✅ 预测完成！共 ${data.total} 条，耗时 ${(data.duration / 1000).toFixed(2)} 秒`)
  }, [predictingTabId])

  /**
   * 处理预测错误事件
   * 显示错误信息，重置预测状态
   * @param error - 错误信息
   */
  const handlePredictError = useCallback((error: { message: string }) => {
    setIsPredicting(false)
    setPredictingTabId(null)
    setMessage(`❌ 预测错误: ${error.message}`)
  }, [])

  /**
   * 取消预测
   * 重置预测状态
   */
  const handleCancelPredict = useCallback(() => {
    setIsPredicting(false)
    setPredictingTabId(null)
    setPredictionProgress(0)
    setMessage('⚠️ 预测已取消')
  }, [])

  // ========== 结果回填功能 ==========

  /**
   * 应用单个预测结果到源数据表
   * 将预测结果回填到对应的单元格
   * @param index - 结果索引
   * @param result - 要应用的预测内容
   */
  const handleApplySingle = useCallback(async (index: number, result: string) => {
    if (!activeTab || activeTab.selectedPredictionColumn === null) return

    const sourceField = activeTab.predictionResults[index]?.sourceField
    if (!sourceField) return

    // 更新数据表中所有匹配的单元格（回填到选中的列）
    const newRows = activeTab.excelData.rows.map(row => {
      const cellValue = String(row[activeTab.selectedPredictionColumn!] ?? '').trim()
      if (cellValue === sourceField) {
        const newRow = [...row]
        // 将结果写入选中的列（原地回填）
        newRow[activeTab.selectedPredictionColumn!] = result
        return newRow
      }
      return row
    })

    setTabs(prev => prev.map(tab => {
      if (tab.id === activeTabId) {
        return {
          ...tab,
          excelData: { ...tab.excelData, rows: newRows },
          hasUnsavedChanges: true
        }
      }
      return tab
    }))

    // 更新数据库中的用户选择
    const recordId = predictionRecordIds.current[index]
    if (recordId) {
      try {
        await window.electronAPI.updateUserSelection({
          id: recordId,
          userSelectedResult: result
        })
      } catch (error) {
        console.error('更新用户选择失败:', error)
      }
    }

    // 保存更新后的预测数据到localStorage
    savePrediction(activeTab.filePath, {
      predictionResults: activeTab.predictionResults,
      selectedPredictionColumn: activeTab.selectedPredictionColumn,
      currentBatchId: activeTab.currentBatchId,
      showPredictionPanel: activeTab.showPredictionPanel
    })

    const columnName = activeTab.excelData.headers[activeTab.selectedPredictionColumn] || `列${activeTab.selectedPredictionColumn + 1}`
    setMessage(`✅ 已应用预测结果到"${columnName}"列: ${sourceField} → ${result}`)
  }, [activeTab, activeTabId])

  /**
   * 批量应用所有预测结果到源数据表
   * 将所有预测结果回填到对应的单元格
   */
  const handleApplyAll = useCallback(async () => {
    if (!activeTab || activeTab.selectedPredictionColumn === null || activeTab.predictionResults.length === 0) return

    // 构建源字段到预测结果的映射
    const resultMap = new Map<string, string>()
    activeTab.predictionResults.forEach(result => {
      resultMap.set(result.sourceField, result.content)
    })

    // 更新所有匹配的行（回填到选中的列）
    const newRows = activeTab.excelData.rows.map(row => {
      const cellValue = String(row[activeTab.selectedPredictionColumn!] ?? '').trim()
      if (resultMap.has(cellValue)) {
        const newRow = [...row]
        // 将结果写入选中的列（原地回填）
        newRow[activeTab.selectedPredictionColumn!] = resultMap.get(cellValue)!
        return newRow
      }
      return row
    })

    setTabs(prev => prev.map(tab => {
      if (tab.id === activeTabId) {
        return {
          ...tab,
          excelData: { ...tab.excelData, rows: newRows },
          hasUnsavedChanges: true
        }
      }
      return tab
    }))

    // 批量更新数据库中的用户选择
    const updatePromises = activeTab.predictionResults.map(async (result, index) => {
      const recordId = predictionRecordIds.current[index]
      if (recordId) {
        try {
          await window.electronAPI.updateUserSelection({
            id: recordId,
            userSelectedResult: result.content
          })
        } catch (error) {
          console.error(`更新记录 ${recordId} 失败:`, error)
        }
      }
    })

    await Promise.all(updatePromises)

    // 保存更新后的预测数据到localStorage
    savePrediction(activeTab.filePath, {
      predictionResults: activeTab.predictionResults,
      selectedPredictionColumn: activeTab.selectedPredictionColumn,
      currentBatchId: activeTab.currentBatchId,
      showPredictionPanel: activeTab.showPredictionPanel
    })

    const columnName = activeTab.excelData.headers[activeTab.selectedPredictionColumn] || `列${activeTab.selectedPredictionColumn + 1}`
    setMessage(`✅ 已批量应用 ${activeTab.predictionResults.length} 个预测结果到"${columnName}"列`)
  }, [activeTab, activeTabId])

  // ========== 反馈功能 ==========

  /**
   * 点击反馈按钮
   * 显示 FeedbackModal 弹窗
   * @param index - 结果索引
   */
  const handleFeedbackClick = useCallback((index: number) => {
    const result = activeTab?.predictionResults[index]
    if (!result) return

    setFeedbackModalData({
      sourceField: result.sourceField,
      predictedResult: result.content,
      index
    })
    setFeedbackModalVisible(true)
  }, [activeTab])

  /**
   * 提交反馈（带实际内容）
   * 保存修正后的反馈到数据库，并更新预测结果面板
   * @param actualContent - 用户输入的实际内容，若为空则默认使用预测结果
   */
  const handleFeedbackSubmit = useCallback(async (actualContent: string) => {
    const { sourceField, predictedResult, index } = feedbackModalData
    
    // 若用户未填写内容，默认采用预测结果作为实际内容（相当于确认正确）
    const finalActualContent = actualContent.trim() || predictedResult
    const isCorrect = finalActualContent === predictedResult
    
    try {
      const recordId = predictionRecordIds.current[index]
      await window.electronAPI.saveFeedbackRecord({
        predictionId: recordId,
        batchId: activeTab?.currentBatchId || '',
        sourceField,
        predictedResult,
        actualContent: finalActualContent,
        isCorrect,
        fileName: activeTab?.excelData.fileName || ''
      })
      
      // 更新预测结果面板：将反馈内容更新到对应位置，置信度改为100%
      if (activeTabId) {
        setTabs(prev => {
          const updatedTabs = prev.map(tab => {
            if (tab.id === activeTabId) {
              const newResults = [...tab.predictionResults]
              const currentResult = newResults[index]
              if (currentResult) {
                // 构建新的备选结果数组：将反馈内容作为最高置信度项插入首位，并去重
                const filteredAlternatives = currentResult.alternatives.filter(
                  a => a.content !== finalActualContent
                )
                const newAlternatives = [
                  { content: finalActualContent, confidence: 1.0 },
                  ...filteredAlternatives
                ]
                
                newResults[index] = {
                  ...currentResult,
                  content: finalActualContent,
                  confidence: 1.0,
                  alternatives: newAlternatives
                }
              }
              const updatedTab = {
                ...tab,
                predictionResults: newResults
              }
              // 保存更新后的预测数据到localStorage
              savePrediction(tab.filePath, {
                predictionResults: updatedTab.predictionResults,
                selectedPredictionColumn: updatedTab.selectedPredictionColumn,
                currentBatchId: updatedTab.currentBatchId,
                showPredictionPanel: updatedTab.showPredictionPanel
              })
              return updatedTab
            }
            return tab
          })
          return updatedTabs
        })
      }
      
      setMessage(isCorrect ? '✅ 已确认预测正确' : '✅ 已提交反馈')
    } catch (error) {
      const errorMessage = formatError(error)
      setMessage(`❌ 保存反馈失败: ${errorMessage}`)
    }
    
    setFeedbackModalVisible(false)
  }, [feedbackModalData, activeTab, activeTabId])

  /**
   * 关闭反馈弹窗
   */
  const handleFeedbackCancel = useCallback(() => {
    setFeedbackModalVisible(false)
  }, [])

  // ========== 事件监听 ==========

  // 使用 ref 存储回调函数，避免依赖项变化导致重新注册监听器
  const handlePredictProgressRef = useRef(handlePredictProgress)
  const handlePredictCompleteRef = useRef(handlePredictComplete)
  const handlePredictErrorRef = useRef(handlePredictError)

  // 同步 ref 值
  useEffect(() => {
    handlePredictProgressRef.current = handlePredictProgress
  }, [handlePredictProgress])

  useEffect(() => {
    handlePredictCompleteRef.current = handlePredictComplete
  }, [handlePredictComplete])

  useEffect(() => {
    handlePredictErrorRef.current = handlePredictError
  }, [handlePredictError])

  // 监听主进程系统菜单触发的打开文件夹事件
  useEffect(() => {
    if (!isElectron()) return
    const callback = (data: { folderPath: string; tree: FileTreeNode[] }) => {
      handleOpenFolder(data.folderPath, data.tree)
    }
    window.electronAPI.onFolderOpened(callback)
    return () => {
      window.electronAPI.offFolderOpened?.()
    }
  }, [handleOpenFolder])

  // 监听主进程系统菜单触发的打开全局设置事件
  useEffect(() => {
    if (!isElectron()) return
    window.electronAPI.onOpenSettings(() => {
      setSettingsVisible(true)
    })
    return () => {
      window.electronAPI.offOpenSettings?.()
    }
  }, [])

  // 组件挂载时清理过期的预测数据
  useEffect(() => {
    cleanupOldPredictions()
  }, [])

  // 监听流式预测事件 - 只注册一次
  useEffect(() => {
    if (!isElectron()) return

    // 使用 ref 包装回调，确保始终调用最新的函数
    const progressCallback = (data: any) => handlePredictProgressRef.current(data)
    const completeCallback = (data: any) => handlePredictCompleteRef.current(data)
    const errorCallback = (data: any) => handlePredictErrorRef.current(data)

    window.electronAPI.onPredictProgress(progressCallback)
    window.electronAPI.onPredictComplete(completeCallback)
    window.electronAPI.onPredictError(errorCallback)

    return () => {
      window.electronAPI.offPredictProgress?.()
      window.electronAPI.offPredictComplete?.()
      window.electronAPI.offPredictError?.()
    }
  }, []) // 空依赖数组，只在组件挂载时执行

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
      <div className="flex flex-1 overflow-hidden gap-2 p-2">
        {/* 左侧：文件浏览器 */}
        <div
          className={`${isSidebarCollapsed ? 'w-10' : ''} transition-all duration-200 flex-shrink-0`}
          style={{ width: isSidebarCollapsed ? 40 : sidebarWidth }}
        >
          <FileExplorer
            tree={directoryTree}
            selectedFilePath={selectedFilePath}
            onFileSelect={handleFileSelect}
            collapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed((v) => !v)}
          />
        </div>

        {/* 可拖拽分隔条（仅展开状态显示） */}
        {!isSidebarCollapsed && (
          <ResizableDivider
            onResize={handleSidebarResize}
            onDoubleClick={handleDividerDoubleClick}
          />
        )}

        {/* 右侧：Excel 数据展示区 */}
        <div className="flex-1 bg-white flex flex-col overflow-hidden rounded-lg">
          {/* Tab栏 */}
          <ExcelTabs
            tabs={tabs}
            activeTabId={activeTabId}
            onTabSelect={handleTabSelect}
            onTabClose={handleCloseTab}
          />

          {/* 工具栏 - 保存按钮 */}
          {excelData && (
            <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-2 bg-gray-50 flex-shrink-0">
              <button onClick={() => handleQuickSave()} disabled={!hasUnsavedChanges}
                className="btn-success flex items-center gap-1 text-sm px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                <Save className="w-4 h-4" /> 保存 (Ctrl+S)
              </button>
              <button onClick={() => handleSave()} className="btn-secondary flex items-center gap-1 text-sm px-3 py-1.5">
                <Edit3 className="w-4 h-4" /> 另存为...
              </button>
              <span className="text-sm text-gray-500 ml-2">
                {excelData.fileName} | Sheet: {excelData.sheetName} | {excelData.rows.length} 行 × {excelData.headers.length} 列
              </span>
              {hasUnsavedChanges && (
                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full font-medium">未保存</span>
              )}
            </div>
          )}

          {/* 数据表格或空状态 */}
          {excelData ? (
            <div className="flex-1 overflow-hidden p-4">
              <DataTable 
                data={excelData} 
                selectedColumn={activeTab?.selectedColumn ?? null} 
                onColumnSelect={(index) => {
                  setTabs(prev => prev.map(tab => 
                    tab.id === activeTabId ? { ...tab, selectedColumn: index } : tab
                  ))
                }} 
                onCellEdit={handleCellEdit}
                onColumnPredict={handleColumnPredict}
                sheets={activeTab?.sheets}
                activeSheetIndex={activeTab?.activeSheetIndex}
                onSheetChange={(sheetIndex) => activeTabId && handleSheetChange(activeTabId, sheetIndex)}
              />
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

      {/* 进度条组件 */}
      <ProgressBar
        progress={predictionProgress}
        current={predictionCurrent}
        total={predictionTotal}
        visible={isPredicting}
        onCancel={handleCancelPredict}
      />

      {/* 预测结果面板 */}
      <PredictionPanel
        results={activePredictionTab?.predictionResults || []}
        visible={!!activePredictionTab}
        onClose={() => {
          if (activePredictionTab) {
            setTabs(prev => prev.map(tab =>
              tab.id === activePredictionTab.id ? { ...tab, showPredictionPanel: false } : tab
            ))
          }
        }}
        onApplySingle={handleApplySingle}
        onApplyAll={handleApplyAll}
        onFeedback={handleFeedbackClick}
        columnName={activePredictionTab?.selectedPredictionColumn !== null && activePredictionTab
          ? (activePredictionTab.excelData.headers[activePredictionTab.selectedPredictionColumn] || `列${activePredictionTab.selectedPredictionColumn + 1}`)
          : ''}
      />

      {/* 反馈弹窗 */}
      <FeedbackModal
        visible={feedbackModalVisible}
        sourceField={feedbackModalData.sourceField}
        predictedResult={feedbackModalData.predictedResult}
        onSubmit={handleFeedbackSubmit}
        onCancel={handleFeedbackCancel}
      />

      {/* 关闭Tab确认对话框 */}
      <CloseTabConfirmDialog
        visible={closeConfirmVisible}
        fileName={tabs.find(t => t.id === closeConfirmTabId)?.fileName || ''}
        onSave={handleCloseConfirmSave}
        onDiscard={handleCloseConfirmDiscard}
        onCancel={handleCloseConfirmCancel}
      />

      {/* 全局设置面板 */}
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onMessage={setMessage}
      />
    </div>
  )
}

export default App