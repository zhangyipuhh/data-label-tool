/**
 * Excel保存参数
 * @property filePath - 文件路径
 * @property headers - 表头数组
 * @property rows - 数据行数组
 * @property mode - 保存模式：overwrite（覆盖）或 ask（询问）
 */
interface SaveExcelParams {
  filePath: string
  headers: string[]
  rows: any[][]
  mode: 'overwrite' | 'ask'
}

/**
 * Excel保存结果
 * @property success - 是否保存成功
 * @property filePath - 保存的文件路径
 * @property fileName - 文件名
 * @property newPath - 新路径（当用户选择新路径时）
 * @property message - 提示消息
 */
interface SaveExcelResult {
  success: boolean
  filePath: string
  fileName?: string
  newPath?: string
  message?: string
}

/**
 * 文件树节点
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
 * 数据库加密状态
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

/**
 * Electron API 接口定义
 * 包含所有主进程暴露给渲染进程的API
 */
interface ElectronAPI {
  // ========== 文件操作 ==========

  /**
   * 选择 Excel 文件
   * @returns Promise<{ success: boolean; filePath?: string; message?: string }>
   */
  selectExcelFile: () => Promise<{
    success: boolean
    filePath?: string
    message?: string
  }>

  /**
   * 读取 Excel 文件（返回所有Sheet信息）
   * @param filePath - Excel文件路径
   * @returns Promise<Excel读取结果>
   */
  readExcel: (filePath: string) => Promise<{
    success: boolean
    headers: string[]
    rows: any[][]
    sheetName: string
    sheetIndex: number
    sheetNames: string[]
    fileName: string
    message?: string
  }>

  /**
   * 按Sheet索引读取指定Sheet
   * @param filePath - Excel文件路径
   * @param sheetIndex - Sheet索引（从0开始）
   * @returns Promise<指定Sheet的读取结果>
   */
  readExcelSheet: (filePath: string, sheetIndex: number) => Promise<{
    success: boolean
    headers: string[]
    rows: any[][]
    sheetName: string
    sheetIndex: number
    message?: string
  }>

  /**
   * 保存 Excel 文件
   * @param params - 保存参数
   * @returns Promise<SaveExcelResult>
   */
  saveExcel: (params: SaveExcelParams) => Promise<SaveExcelResult>

  // ========== 推理 ==========

  /**
   * 运行推理
   * @param columnData - 列数据
   * @param columnName - 列名
   * @returns Promise<推理结果>
   */
  runInference: (columnData: string[], columnName: string) => Promise<any>

  // ========== 文件夹操作 ==========

  /**
   * 选择文件夹
   * @returns Promise<文件夹选择结果>
   */
  selectFolder: () => Promise<{
    success: boolean
    folderPath?: string
    message?: string
  }>

  /**
   * 读取目录树
   * @param folderPath - 文件夹路径
   * @returns Promise<目录树读取结果>
   */
  readDirectoryTree: (folderPath: string) => Promise<{
    success: boolean
    tree?: FileTreeNode[]
    message?: string
  }>

  // ========== 流式预测 ==========

  /**
   * 启动流式预测
   * @param data - 待预测的文本数组
   * @param k - 返回的候选结果数量，默认为 3
   * @returns Promise<void>
   */
  predictStream: (data: string[], k?: number) => Promise<void>

  /**
   * 监听流式预测进度事件
   * @param callback - 进度回调函数
   */
  onPredictProgress: (callback: (data: PredictProgressData) => void) => void

  /**
   * 监听流式预测完成事件
   * @param callback - 完成回调函数
   */
  onPredictComplete: (callback: (data: PredictCompleteData) => void) => void

  /**
   * 监听流式预测错误事件
   * @param callback - 错误回调函数
   */
  onPredictError: (callback: (error: { message: string }) => void) => void
  offPredictProgress: () => void
  offPredictComplete: () => void
  offPredictError: () => void

  // ========== 预测记录 ==========

  /**
   * 保存预测记录
   * @param record - 预测记录参数
   * @returns Promise<保存结果>
   */
  savePredictionRecord: (record: PredictionRecordParams) => Promise<{
    success: boolean
    id?: number
    message?: string
  }>

  /**
   * 更新用户选择
   * @param params - 用户选择更新参数
   * @returns Promise<更新结果>
   */
  updateUserSelection: (params: UpdateUserSelectionParams) => Promise<{
    success: boolean
    message?: string
  }>

  /**
   * 获取预测记录
   * @param params - 可选的查询参数
   * @returns Promise<预测记录查询结果>
   */
  getPredictionRecords: (params?: GetPredictionRecordsParams) => Promise<{
    success: boolean
    records?: any[]
    total?: number
    message?: string
  }>

  // ========== 反馈 ==========

  /**
   * 保存反馈（旧版接口）
   * @param feedback - 反馈数据
   * @returns Promise<保存结果>
   */
  saveFeedback: (feedback: {
    inputText: string
    modelOutput: string
    confidence: number
    userConfirm: boolean
    correctedValue?: string
    columnName: string
    fileName: string
  }) => Promise<any>

  /**
   * 保存反馈记录（新版接口）
   * @param record - 反馈记录参数
   * @returns Promise<保存结果>
   */
  saveFeedbackRecord: (record: FeedbackRecordParams) => Promise<{
    success: boolean
    message?: string
  }>

  /**
   * 获取反馈统计
   * @returns Promise<统计结果>
   */
  getFeedbackStats: () => Promise<{
    success: boolean
    stats?: {
      total: number
      confirmed: number
      rejected: number
    }
    message?: string
  }>

  /**
   * 导出反馈数据
   * @param format - 导出格式：json 或 csv
   * @returns Promise<导出结果>
   */
  exportFeedback: (format: 'json' | 'csv') => Promise<any>

  /**
   * 导出反馈报告为 Excel
   * @returns Promise<{ success: boolean; filePath?: string; message?: string }>
   */
  exportFeedbackReport: () => Promise<{
    success: boolean
    filePath?: string
    message?: string
  }>

  // ========== 数据库加密 ==========

  /**
   * 获取数据库加密状态
   * @returns Promise<加密状态>
   */
  getEncryptionStatus: () => Promise<{
    success: boolean
    status?: EncryptionStatus
    message?: string
  }>

  /**
   * 解密数据库（仅调试模式可用）
   * @param params - 解密参数
   * @returns Promise<解密结果>
   */
  decryptDatabase: (params: DecryptDatabaseParams) => Promise<{
    success: boolean
    message?: string
    outputPath?: string
  }>

  /**
   * 生成新的加密密钥（仅调试模式可用）
   * @returns Promise<密钥生成结果>
   */
  generateEncryptionKey: () => Promise<{
    success: boolean
    key?: string
    message?: string
  }>

  /**
   * 获取机器指纹信息（仅调试模式可用）
   * @returns Promise<机器指纹结果>
   */
  getMachineFingerprint: () => Promise<{
    success: boolean
    fingerprint?: any
    message?: string
  }>

  // ========== 应用信息 ==========

  /**
   * 获取应用版本
   * @returns Promise<{ version: string }>
   */
  getAppVersion: () => Promise<{ version: string }>

  // ========== 设置相关 ==========

  /**
   * 监听打开全局设置事件
   * @param callback - 回调函数
   */
  onOpenSettings: (callback: () => void) => void
  offOpenSettings: () => void

  /**
   * 读取 GPU 配置
   * @returns Promise<{ success: boolean; config?: { device: string; cuda_visible_devices: string }; message?: string }>
   */
  readGpuConfig: () => Promise<{
    success: boolean
    config?: {
      device: string
      cuda_visible_devices: string
    }
    message?: string
  }>

  /**
   * 保存 GPU 配置
   * @param config - GPU 配置对象
   * @returns Promise<{ success: boolean; message?: string }>
   */
  saveGpuConfig: (config: { device: string; cuda_visible_devices: string }) => Promise<{
    success: boolean
    message?: string
  }>

  /**
   * 读取过滤规则配置
   * @returns Promise<{ success: boolean; config?: any; message?: string }>
   */
  readFilterConfig: () => Promise<{
    success: boolean
    config?: any
    message?: string
  }>

  /**
   * 保存过滤规则配置
   * @param config - 过滤规则配置对象
   * @returns Promise<{ success: boolean; message?: string }>
   */
  saveFilterConfig: (config: any) => Promise<{
    success: boolean
    message?: string
  }>

  // ========== 事件监听 ==========

  /**
   * 监听文件夹打开事件
   * @param callback - 回调函数
   */
  onFolderOpened: (callback: (data: {
    folderPath: string
    tree: FileTreeNode[]
  }) => void) => void
  offFolderOpened: () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
