import { useState, useCallback, useEffect, useRef } from 'react'
import { FileSpreadsheet, Save, Edit3, AlertCircle, X } from 'lucide-react'
import DataTable from './components/DataTable'
import FileExplorer from './components/FileExplorer'
import ProgressBar from './components/ProgressBar'
import PredictionPanel, { PredictionResult } from './components/PredictionPanel'
import FeedbackModal from './components/FeedbackModal'

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

/** 预测记录映射接口，用于存储预测记录ID */
interface PredictionRecordMap {
  [index: number]: number
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

  // ========== 预测相关状态 ==========
  /** 是否正在预测中 */
  const [isPredicting, setIsPredicting] = useState(false)
  /** 预测进度百分比（0-100） */
  const [predictionProgress, setPredictionProgress] = useState(0)
  /** 当前已处理的预测数量 */
  const [predictionCurrent, setPredictionCurrent] = useState(0)
  /** 预测总数 */
  const [predictionTotal, setPredictionTotal] = useState(0)
  /** 预测结果列表 */
  const [predictionResults, setPredictionResults] = useState<PredictionResult[]>([])
  /** 是否显示预测结果面板 */
  const [showPredictionPanel, setShowPredictionPanel] = useState(false)
  /** 当前选中的预测列索引 */
  const [selectedPredictionColumn, setSelectedPredictionColumn] = useState<number | null>(null)
  /** 当前批次ID */
  const [currentBatchId, setCurrentBatchId] = useState<string>('')
  /** 预测记录ID映射（用于后续更新用户选择） */
  const predictionRecordIds = useRef<PredictionRecordMap>({})
  /** 当前预测的源字段列表（用于关联预测结果和原始输入） */
  const currentPredictionSourceFields = useRef<string[]>([])

  // ========== 反馈弹窗状态 ==========
  /** 反馈弹窗是否可见 */
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false)
  /** 反馈弹窗数据 */
  const [feedbackModalData, setFeedbackModalData] = useState({ 
    sourceField: '', 
    predictedResult: '', 
    index: 0 
  })

  /**
   * 生成唯一批次ID
   * 使用时间戳和随机数组合
   * @returns 批次ID字符串
   */
  const generateBatchId = (): string => {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

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
    if (!excelData) {
      setMessage('❌ 请先加载数据文件')
      return
    }

    try {
      // 收集选中列的所有唯一值（非空）
      const columnValues: string[] = []
      const uniqueValues = new Set<string>()
      
      excelData.rows.forEach(row => {
        const value = String(row[columnIndex] || '').trim()
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
      setCurrentBatchId(batchId)
      setSelectedPredictionColumn(columnIndex)
      
      // 重置预测状态
      setIsPredicting(true)
      setPredictionProgress(0)
      setPredictionCurrent(0)
      setPredictionTotal(columnValues.length)
      setPredictionResults([])
      predictionRecordIds.current = {}
      // 保存源字段列表，用于后续关联预测结果
      currentPredictionSourceFields.current = columnValues

      setMessage(`🚀 开始预测列 "${excelData.headers[columnIndex] || `列${columnIndex + 1}`}"，共 ${columnValues.length} 个唯一值`)

      // 启动流式预测
      await window.electronAPI.predictStream(columnValues, 3)
    } catch (error) {
      setIsPredicting(false)
      setMessage(`❌ 预测启动失败: ${error}`)
    }
  }, [excelData])

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

    // 添加到结果列表
    setPredictionResults(prev => [...prev, predictionResult])

    // 保存预测记录到数据库
      if (excelData && currentFilePath && selectedPredictionColumn !== null) {
        try {
          const result = await window.electronAPI.savePredictionRecord({
            batchId: currentBatchId,
            sourceField: sourceField,
            predictedResult: data.result.content,
            confidence: data.result.confidence,
            columnName: excelData.headers[selectedPredictionColumn] || `列${selectedPredictionColumn + 1}`,
            fileName: excelData.fileName
          })

        if (result.success && result.id) {
          // 保存记录ID，用于后续更新用户选择
          predictionRecordIds.current[data.index] = result.id
        }
      } catch (error) {
        console.error('保存预测记录失败:', error)
      }
    }
  }, [excelData, currentFilePath, selectedPredictionColumn, currentBatchId])

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
    setShowPredictionPanel(true)
    setMessage(`✅ 预测完成！共 ${data.total} 条，耗时 ${(data.duration / 1000).toFixed(2)} 秒`)
  }, [])

  /**
   * 处理预测错误事件
   * 显示错误信息，重置预测状态
   * @param error - 错误信息
   */
  const handlePredictError = useCallback((error: { message: string }) => {
    setIsPredicting(false)
    setMessage(`❌ 预测错误: ${error.message}`)
  }, [])

  /**
   * 取消预测
   * 重置预测状态
   */
  const handleCancelPredict = useCallback(() => {
    setIsPredicting(false)
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
    if (!excelData || selectedPredictionColumn === null) return

    const sourceField = predictionResults[index]?.sourceField
    if (!sourceField) return

    // 更新数据表中所有匹配的单元格（回填到选中的列）
    const newRows = excelData.rows.map(row => {
      const cellValue = String(row[selectedPredictionColumn] || '').trim()
      if (cellValue === sourceField) {
        const newRow = [...row]
        // 将结果写入选中的列（原地回填）
        newRow[selectedPredictionColumn] = result
        return newRow
      }
      return row
    })

    setExcelData({ ...excelData, rows: newRows })
    setHasUnsavedChanges(true)

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

    const columnName = excelData.headers[selectedPredictionColumn] || `列${selectedPredictionColumn + 1}`
    setMessage(`✅ 已应用预测结果到"${columnName}"列: ${sourceField} → ${result}`)
  }, [excelData, selectedPredictionColumn, predictionResults])

  /**
   * 批量应用所有预测结果到源数据表
   * 将所有预测结果回填到对应的单元格
   */
  const handleApplyAll = useCallback(async () => {
    if (!excelData || selectedPredictionColumn === null || predictionResults.length === 0) return

    // 构建源字段到预测结果的映射
    const resultMap = new Map<string, string>()
    predictionResults.forEach(result => {
      resultMap.set(result.sourceField, result.content)
    })

    // 更新所有匹配的行（回填到选中的列）
    const newRows = excelData.rows.map(row => {
      const cellValue = String(row[selectedPredictionColumn] || '').trim()
      if (resultMap.has(cellValue)) {
        const newRow = [...row]
        // 将结果写入选中的列（原地回填）
        newRow[selectedPredictionColumn] = resultMap.get(cellValue)!
        return newRow
      }
      return row
    })

    setExcelData({ ...excelData, rows: newRows })
    setHasUnsavedChanges(true)

    // 批量更新数据库中的用户选择
    const updatePromises = predictionResults.map(async (result, index) => {
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

    const columnName = excelData.headers[selectedPredictionColumn] || `列${selectedPredictionColumn + 1}`
    setMessage(`✅ 已批量应用 ${predictionResults.length} 个预测结果到"${columnName}"列`)
  }, [excelData, selectedPredictionColumn, predictionResults])

  // ========== 反馈功能 ==========

  /**
   * 点击反馈按钮
   * 显示 FeedbackModal 弹窗
   * @param index - 结果索引
   */
  const handleFeedbackClick = useCallback((index: number) => {
    const result = predictionResults[index]
    if (!result) return

    setFeedbackModalData({
      sourceField: result.sourceField,
      predictedResult: result.content,
      index
    })
    setFeedbackModalVisible(true)
  }, [predictionResults])

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
        batchId: currentBatchId,
        sourceField,
        predictedResult,
        actualContent: finalActualContent,
        isCorrect,
        fileName: excelData?.fileName || ''
      })
      
      // 更新预测结果面板：将反馈内容更新到对应位置，置信度改为100%
      setPredictionResults(prev => {
        const newResults = [...prev]
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
        return newResults
      })
      
      setMessage(isCorrect ? '✅ 已确认预测正确' : '✅ 已提交反馈')
    } catch (error) {
      setMessage(`❌ 保存反馈失败: ${error}`)
    }
    
    setFeedbackModalVisible(false)
  }, [feedbackModalData, currentBatchId, excelData])

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
    // ipcRenderer.on 不需要手动移除，通道随页面生命周期管理
  }, [handleOpenFolder])

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

    // 注意：ipcRenderer.on 不需要手动移除，通道随页面生命周期管理
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
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：文件浏览器 */}
        <div className="w-[20%] min-w-[200px]">
          <FileExplorer tree={directoryTree} selectedFilePath={selectedFilePath} onFileSelect={handleFileSelect} />
        </div>

        {/* 右侧：Excel 数据展示区 */}
        <div className="flex-[3] bg-white flex flex-col overflow-hidden">
          {/* 工具栏 - 保存按钮 */}
          {excelData && (
            <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-2 bg-gray-50 flex-shrink-0">
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
            <div className="flex-1 overflow-hidden p-4">
              <DataTable 
                data={excelData} 
                selectedColumn={null} 
                onColumnSelect={() => {}} 
                onCellEdit={handleCellEdit}
                onColumnPredict={handleColumnPredict}
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
        results={predictionResults}
        visible={showPredictionPanel}
        onClose={() => setShowPredictionPanel(false)}
        onApplySingle={handleApplySingle}
        onApplyAll={handleApplyAll}
        onFeedback={handleFeedbackClick}
        columnName={selectedPredictionColumn !== null && excelData 
          ? (excelData.headers[selectedPredictionColumn] || `列${selectedPredictionColumn + 1}`) 
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
    </div>
  )
}

export default App
