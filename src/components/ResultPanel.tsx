import React, { useState } from 'react'
import { Check, X, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import { ExcelData } from '../App'

/** 推理结果接口，包含主结果和备选结果 */
export interface InferenceResult {
  content: string
  confidence: number
  alternatives?: { content: string; confidence: number }[]
}

interface Props {
  results: InferenceResult[]
  excelData: ExcelData | null
  selectedColumn: number | null
  onFeedback: (index: number, isConfirm: boolean, correctedValue?: string) => void
  onApplySingle: (index: number) => void
}

const ResultPanel: React.FC<Props> = ({ results, excelData, selectedColumn, onFeedback, onApplySingle }) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [correctedValues, setCorrectedValues] = useState<Record<number, string>>({})

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500'
    if (confidence >= 0.5) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return '高'
    if (confidence >= 0.5) return '中'
    return '低'
  }

  return (
    <div className="space-y-2 max-h-[600px] overflow-auto">
      {results.map((result, index) => {
        const originalValue = excelData && selectedColumn !== null 
          ? String(excelData.rows[index]?.[selectedColumn] || '') 
          : ''

        const isExpanded = expandedIndex === index

        return (
          <div key={index} className="border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow bg-white">
            {/* 序号和原始值 */}
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1.5">
              <span className="bg-gray-100 px-1.5 py-0.5 rounded">#{index + 1}</span>
              <span className="truncate">原: {originalValue || '(空)'}</span>
            </div>

            {/* 推理结果 */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate" title={result.content}>
                  {result.content}
                </p>

                {/* 置信度 */}
                <div className="mt-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">置信度:</span>
                    <span className={`font-semibold ${
                      result.confidence >= 0.8 ? 'text-green-600' : 
                      result.confidence >= 0.5 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {getConfidenceLabel(result.confidence)} ({(result.confidence * 100).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden mt-1">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${getConfidenceColor(result.confidence)}`}
                      style={{ width: `${result.confidence * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex flex-col gap-1 flex-shrink-0">
                {/* 应用到表格 */}
                <button 
                  onClick={() => onApplySingle(index)}
                  className="p-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                  title="应用此结果到表格"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => onFeedback(index, true)}
                  className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                  title="确认正确"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => onFeedback(index, false)}
                  className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                  title="标记错误"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 备选结果 */}
            {result.alternatives && result.alternatives.length > 0 && (
              <div className="mt-2">
                <button 
                  onClick={() => setExpandedIndex(isExpanded ? null : index)}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  备选 ({result.alternatives.length})
                </button>

                {isExpanded && (
                  <div className="mt-1.5 space-y-1 pl-3 border-l-2 border-gray-200">
                    {result.alternatives.map((alt: { content: string; confidence: number }, altIndex: number) => (
                      <div key={altIndex} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 truncate">{alt.content}</span>
                        <span className="text-gray-500 flex-shrink-0">{(alt.confidence * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 修正输入 */}
            <div className="mt-2 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="输入正确值..."
                  className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={correctedValues[index] || ''}
                  onChange={(e) => setCorrectedValues(prev => ({ ...prev, [index]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && correctedValues[index]) {
                      onFeedback(index, false, correctedValues[index])
                      setCorrectedValues(prev => ({ ...prev, [index]: '' }))
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (correctedValues[index]) {
                      onFeedback(index, false, correctedValues[index])
                      setCorrectedValues(prev => ({ ...prev, [index]: '' }))
                    }
                  }}
                  disabled={!correctedValues[index]}
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  提交
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ResultPanel
