import { PredictionResult } from '../components/PredictionPanel'

/**
 * 持久化的预测数据结构
 */
export interface PersistedPredictionData {
  /** 文件路径 */
  filePath: string
  /** 预测结果列表 */
  predictionResults: PredictionResult[]
  /** 当前预测的列索引 */
  selectedPredictionColumn: number | null
  /** 当前预测批次ID */
  currentBatchId: string
  /** 是否显示预测面板 */
  showPredictionPanel: boolean
  /** 保存时间戳 */
  timestamp: number
}

/** localStorage 键名 */
const STORAGE_KEY = 'data-label-tool:predictions'

/**
 * 获取所有持久化的预测数据
 * @returns 预测数据映射（filePath -> PersistedPredictionData）
 */
export const getAllPredictions = (): Record<string, PersistedPredictionData> => {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (data) {
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('读取预测数据失败:', error)
  }
  return {}
}

/**
 * 保存预测数据到 localStorage
 * @param filePath - 文件路径
 * @param data - 预测数据
 */
export const savePrediction = (
  filePath: string,
  data: Omit<PersistedPredictionData, 'filePath' | 'timestamp'>
): void => {
  try {
    const allPredictions = getAllPredictions()
    allPredictions[filePath] = {
      ...data,
      filePath,
      timestamp: Date.now()
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allPredictions))
  } catch (error) {
    console.error('保存预测数据失败:', error)
  }
}

/**
 * 获取指定文件的预测数据
 * @param filePath - 文件路径
 * @returns 预测数据，不存在则返回 null
 */
export const getPrediction = (filePath: string): PersistedPredictionData | null => {
  const allPredictions = getAllPredictions()
  return allPredictions[filePath] || null
}

/**
 * 删除指定文件的预测数据
 * @param filePath - 文件路径
 */
export const removePrediction = (filePath: string): void => {
  try {
    const allPredictions = getAllPredictions()
    delete allPredictions[filePath]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allPredictions))
  } catch (error) {
    console.error('删除预测数据失败:', error)
  }
}

/**
 * 清理过期的预测数据（默认保留7天）
 * @param maxAge - 最大保留时间（毫秒），默认7天
 */
export const cleanupOldPredictions = (maxAge: number = 7 * 24 * 60 * 60 * 1000): void => {
  try {
    const allPredictions = getAllPredictions()
    const now = Date.now()
    let hasChanges = false

    Object.keys(allPredictions).forEach(filePath => {
      if (now - allPredictions[filePath].timestamp > maxAge) {
        delete allPredictions[filePath]
        hasChanges = true
      }
    })

    if (hasChanges) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allPredictions))
    }
  } catch (error) {
    console.error('清理过期预测数据失败:', error)
  }
}
