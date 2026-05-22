import { useState } from 'react'
import { X, ThumbsDown, ChevronDown, ChevronUp, Check, ArrowRight } from 'lucide-react'

/**
 * 预测结果接口，包含源字段、预测内容、置信度和备选结果
 */
export interface PredictionResult {
  /** 源字段名称（缩写） */
  sourceField: string
  /** 预测全称内容 */
  content: string
  /** 置信度（0-1之间） */
  confidence: number
  /** 备选结果列表，按置信度降序排列 */
  alternatives: { content: string; confidence: number }[]
}

/**
 * PredictionPanel 组件属性接口
 */
interface PredictionPanelProps {
  /** 预测结果列表 */
  results: PredictionResult[]
  /** 面板是否可见 */
  visible: boolean
  /** 关闭面板回调函数 */
  onClose: () => void
  /**
   * 应用单个预测结果回调函数
   * @param index - 结果索引
   * @param result - 要应用的预测内容
   */
  onApplySingle: (index: number, result: string) => void
  /** 批量应用所有预测结果回调函数 */
  onApplyAll: () => void
  /**
   * 反馈回调函数
   * @param index - 结果索引
   */
  onFeedback: (index: number) => void
  /** 当前选中的列名称 */
  columnName: string
}

/**
 * 预测结果面板组件
 * 
 * 功能：
 * - 滑出式面板，显示在屏幕右侧，宽度400px
 * - 展示选中列的所有字段及其预测结果
 * - 支持单个/批量应用预测结果
 * - 支持反馈和查看备选结果
 * 
 * @param props - 组件属性
 * @returns React组件
 */
const PredictionPanel = ({
  results,
  visible,
  onClose,
  onApplySingle,
  onApplyAll,
  onFeedback,
  columnName
}: PredictionPanelProps) => {
  /** 记录每个结果的展开状态（显示备选列表） */
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set())

  /**
   * 根据置信度获取背景颜色类名
   * @param confidence - 置信度值（0-1）
   * @returns Tailwind CSS颜色类名
   */
  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'bg-green-500'
    if (confidence >= 0.5) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  /**
   * 根据置信度获取文字颜色类名
   * @param confidence - 置信度值（0-1）
   * @returns Tailwind CSS文字颜色类名
   */
  const getConfidenceTextColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-600'
    if (confidence >= 0.5) return 'text-yellow-600'
    return 'text-red-600'
  }

  /**
   * 根据置信度获取标签文字
   * @param confidence - 置信度值（0-1）
   * @returns 置信度标签（高/中/低）
   */
  const getConfidenceLabel = (confidence: number): string => {
    if (confidence >= 0.8) return '高'
    if (confidence >= 0.5) return '中'
    return '低'
  }

  /**
   * 切换指定索引结果的展开状态
   * @param index - 结果索引
   */
  const toggleExpand = (index: number): void => {
    setExpandedIndices(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }



  return (
    <>
      {/* 遮罩层 - 点击可关闭面板 */}
      <div
        className={`fixed inset-0 bg-black/30 transition-opacity duration-300 z-40 ${
          visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* 滑出式面板 */}
      <div
        className={`fixed top-0 right-0 h-full w-[400px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* 面板头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">预测结果</h2>
            <p className="text-xs text-gray-500 mt-0.5">列: {columnName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
            title="关闭面板"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* 全部应用按钮区域 */}
        {results.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/50">
            <button
              onClick={onApplyAll}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
            >
              <Check className="w-4 h-4" />
              全部应用 ({results.length}个字段)
            </button>
          </div>
        )}

        {/* 预测结果列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: 'calc(100% - 140px)' }}>
          {results.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">暂无预测结果</p>
            </div>
          ) : (
            results.map((result, index) => {
              const isExpanded = expandedIndices.has(index)
              // 备选结果按置信度降序排列
              const sortedAlternatives = [...result.alternatives].sort(
                (a, b) => b.confidence - a.confidence
              )

              return (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow bg-white"
                >
                  {/* 第一行：反馈按钮 + 预测全称 + 展开/应用按钮 */}
                  <div className="flex items-center gap-2 mb-2">
                    {/* 反馈按钮（踩图标） */}
                    <button
                      onClick={() => onFeedback(index)}
                      className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors flex-shrink-0"
                      title="反馈"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                    </button>

                    {/* 预测全称 */}
                    <p
                      className="flex-1 text-sm font-medium text-gray-900 truncate"
                      title={result.content}
                    >
                      {result.content}
                    </p>

                    {/* 展开按钮（如果有备选结果） */}
                    {sortedAlternatives.length > 0 && (
                      <button
                        onClick={() => toggleExpand(index)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                        title={isExpanded ? '收起备选' : '展开备选'}
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    )}

                    {/* 应用按钮 */}
                    <button
                      onClick={() => onApplySingle(index, result.content)}
                      className="p-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors flex-shrink-0"
                      title="应用此结果"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* 第二行：源字段（完整显示，一行一个） */}
                  <div className="mb-2">
                    <p
                      className="text-sm text-gray-600 truncate"
                      title={result.sourceField}
                    >
                      {result.sourceField}
                    </p>
                  </div>

                  {/* 第三行：置信度 */}
                  <div className="mb-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">置信度:</span>
                      <span className={`font-semibold ${getConfidenceTextColor(result.confidence)}`}>
                        {getConfidenceLabel(result.confidence)} ({(result.confidence * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden mt-1">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${getConfidenceColor(
                          result.confidence
                        )}`}
                        style={{ width: `${result.confidence * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* 备选结果列表 */}
                  {isExpanded && sortedAlternatives.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-1.5">备选结果:</p>
                      <div className="space-y-1.5">
                        {sortedAlternatives.map((alt, altIndex) => (
                          <div
                            key={altIndex}
                            className="flex items-center justify-between text-xs py-1.5 px-2 bg-gray-50 rounded"
                          >
                            <span className="text-gray-700 truncate flex-1 mr-2" title={alt.content}>
                              {altIndex + 1}. {alt.content}
                            </span>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`font-medium ${getConfidenceTextColor(alt.confidence)}`}>
                                {(alt.confidence * 100).toFixed(1)}%
                              </span>
                              <button
                                onClick={() => onApplySingle(index, alt.content)}
                                className="p-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
                                title="应用此备选"
                              >
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}

export default PredictionPanel
