import { contextBridge, ipcRenderer } from 'electron'

/**
 * 流式预测参数
 * @property data - 待预测的文本数组
 * @property k - 返回的候选结果数量，默认为 3
 */
interface PredictStreamParams {
  data: string[]
  k?: number
}

// 用于防止重复注册事件监听器的标志
const eventListenersRegistered = {
  predictProgress: false,
  predictComplete: false,
  predictError: false,
  folderOpened: false
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

/**
 * 用户选择更新参数
 * @property id - 记录ID
 * @property userSelectedResult - 用户选择的结果
 */
interface UpdateUserSelectionParams {
  id: number
  userSelectedResult: string
}

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

/**
 * 获取预测记录参数
 * @property batchId - 可选的批次ID过滤条件
 */
interface GetPredictionRecordsParams {
  batchId?: string
}

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

/**
 * 解密数据库参数
 * @property outputPath - 解密后的数据库输出路径
 */
interface DecryptDatabaseParams {
  outputPath: string
}

contextBridge.exposeInMainWorld('electronAPI', {
  // 文件操作
  selectExcelFile: () => ipcRenderer.invoke('select-excel-file'),
  readExcel: (filePath: string) => ipcRenderer.invoke('read-excel', filePath),
  saveExcel: (params: {
    filePath: string
    headers: string[]
    rows: any[][]
    mode: 'overwrite' | 'ask'
  }) => ipcRenderer.invoke('save-excel', params),

  // 推理
  runInference: (columnData: string[], columnName: string) => 
    ipcRenderer.invoke('run-inference', columnData, columnName),

  // 反馈
  saveFeedback: (feedback: {
    inputText: string
    modelOutput: string
    confidence: number
    userConfirm: boolean
    correctedValue?: string
    columnName: string
    fileName: string
  }) => ipcRenderer.invoke('save-feedback', feedback),

  getFeedbackStats: () => ipcRenderer.invoke('get-feedback-stats'),
  exportFeedback: (format: 'json' | 'csv') => ipcRenderer.invoke('export-feedback', format),

  // 应用信息
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // 文件夹操作
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readDirectoryTree: (folderPath: string) => ipcRenderer.invoke('read-directory-tree', folderPath),

  // ========== 流式预测相关接口 ==========
  
  /**
   * 启动流式预测
   * @param data - 待预测的文本数组
   * @param k - 返回的候选结果数量，默认为 3
   * @returns Promise<void> - 流式预测启动结果
   * @throws 流式预测启动失败时抛出错误
   */
  predictStream: (data: string[], k?: number) => 
    ipcRenderer.invoke('predict-stream', { data, k } as PredictStreamParams),

  /**
   * 保存预测记录
   * @param record - 预测记录参数
   * @returns Promise<{ success: boolean; id?: number; message?: string }> - 保存结果
   */
  savePredictionRecord: (record: PredictionRecordParams) => 
    ipcRenderer.invoke('save-prediction-record', record),

  /**
   * 更新用户选择
   * @param params - 用户选择更新参数
   * @returns Promise<{ success: boolean; message?: string }> - 更新结果
   */
  updateUserSelection: (params: UpdateUserSelectionParams) => 
    ipcRenderer.invoke('update-user-selection', params),

  /**
   * 保存反馈记录
   * @param record - 反馈记录参数
   * @returns Promise<{ success: boolean; id?: number; message?: string }> - 保存结果
   */
  saveFeedbackRecord: (record: FeedbackRecordParams) => 
    ipcRenderer.invoke('save-feedback-record', record),

  /**
   * 获取预测记录
   * @param params - 可选的查询参数，包含 batchId 过滤条件
   * @returns Promise<{ success: boolean; records?: any[]; total?: number; message?: string }> - 查询结果
   */
  getPredictionRecords: (params?: GetPredictionRecordsParams) =>
    ipcRenderer.invoke('get-prediction-records', params),

  // ========== 数据库加密相关接口 ==========

  /**
   * 获取数据库加密状态
   * @returns Promise<{ success: boolean; status?: EncryptionStatus; message?: string }> - 加密状态
   */
  getEncryptionStatus: () =>
    ipcRenderer.invoke('get-encryption-status'),

  /**
   * 解密数据库（仅调试模式可用）
   * @param params - 解密参数
   * @returns Promise<{ success: boolean; message?: string; outputPath?: string }> - 解密结果
   */
  decryptDatabase: (params: DecryptDatabaseParams) =>
    ipcRenderer.invoke('decrypt-database', params),

  /**
   * 生成新的加密密钥（仅调试模式可用）
   * @returns Promise<{ success: boolean; key?: string; message?: string }> - 生成的密钥
   */
  generateEncryptionKey: () =>
    ipcRenderer.invoke('generate-encryption-key'),

  /**
   * 获取机器指纹信息（仅调试模式可用）
   * @returns Promise<{ success: boolean; fingerprint?: any; message?: string }> - 机器指纹
   */
  getMachineFingerprint: () =>
    ipcRenderer.invoke('get-machine-fingerprint'),

  // ========== 事件监听 ==========

  // 监听主进程事件
  onFolderOpened: (callback: (data: { folderPath: string; tree: any[] }) => void) => {
    if (!eventListenersRegistered.folderOpened) {
      eventListenersRegistered.folderOpened = true
      ipcRenderer.on('folder-opened', (_, data) => callback(data))
    }
  },

  /**
   * 监听流式预测进度事件
   * @param callback - 进度回调函数，接收 PredictProgressData 数据
   * @returns void
   */
  onPredictProgress: (callback: (data: PredictProgressData) => void) => {
    if (!eventListenersRegistered.predictProgress) {
      eventListenersRegistered.predictProgress = true
      ipcRenderer.on('predict-progress', (_, data) => callback(data))
    }
  },

  /**
   * 监听流式预测完成事件
   * @param callback - 完成回调函数，接收 PredictCompleteData 数据
   * @returns void
   */
  onPredictComplete: (callback: (data: PredictCompleteData) => void) => {
    if (!eventListenersRegistered.predictComplete) {
      eventListenersRegistered.predictComplete = true
      ipcRenderer.on('predict-complete', (_, data) => callback(data))
    }
  },

  /**
   * 监听流式预测错误事件
   * @param callback - 错误回调函数，接收错误信息
   * @returns void
   */
  onPredictError: (callback: (error: { message: string }) => void) => {
    if (!eventListenersRegistered.predictError) {
      eventListenersRegistered.predictError = true
      ipcRenderer.on('predict-error', (_, data) => callback(data))
    }
  }
})

declare global {
  interface Window {
    electronAPI: {
      // 文件操作
      selectExcelFile: () => Promise<any>
      readExcel: (filePath: string) => Promise<any>
      saveExcel: (params: any) => Promise<any>
      
      // 推理
      runInference: (columnData: string[], columnName: string) => Promise<any>
      
      // 反馈
      saveFeedback: (feedback: any) => Promise<any>
      getFeedbackStats: () => Promise<any>
      exportFeedback: (format: 'json' | 'csv') => Promise<any>
      
      // 应用信息
      getAppVersion: () => Promise<{ version: string }>
      
      // 文件夹操作
      selectFolder: () => Promise<any>
      readDirectoryTree: (folderPath: string) => Promise<any>
      
      // 流式预测
      predictStream: (data: string[], k?: number) => Promise<any>
      savePredictionRecord: (record: PredictionRecordParams) => Promise<any>
      updateUserSelection: (params: UpdateUserSelectionParams) => Promise<any>
      saveFeedbackRecord: (record: FeedbackRecordParams) => Promise<any>
      getPredictionRecords: (params?: GetPredictionRecordsParams) => Promise<any>

      // 数据库加密
      getEncryptionStatus: () => Promise<{ success: boolean; status?: EncryptionStatus; message?: string }>
      decryptDatabase: (params: DecryptDatabaseParams) => Promise<{ success: boolean; message?: string; outputPath?: string }>
      generateEncryptionKey: () => Promise<{ success: boolean; key?: string; message?: string }>
      getMachineFingerprint: () => Promise<{ success: boolean; fingerprint?: any; message?: string }>

      // 事件监听
      onFolderOpened: (callback: (data: { folderPath: string; tree: any[] }) => void) => void
      onPredictProgress: (callback: (data: PredictProgressData) => void) => void
      onPredictComplete: (callback: (data: PredictCompleteData) => void) => void
      onPredictError: (callback: (error: { message: string }) => void) => void
    }
  }
}
