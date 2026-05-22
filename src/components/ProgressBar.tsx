import React from 'react'
import { X } from 'lucide-react'

/**
 * 进度条组件 Props 接口
 * @property progress - 当前进度值，范围 0-100
 * @property current - 当前已处理数量
 * @property total - 总数量
 * @property onCancel - 取消回调函数，可选
 * @property visible - 是否显示进度条
 */
interface ProgressBarProps {
  progress: number
  current: number
  total: number
  onCancel?: () => void
  visible: boolean
}

/**
 * 进度条组件
 * 用于显示预测任务的进度，包括进度条、处理数量、百分比和取消按钮
 * @param props - 组件属性
 * @returns React 组件
 */
const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  current,
  total,
  onCancel,
  visible
}) => {
  // 不可见时不渲染
  if (!visible) return null

  // 确保进度值在 0-100 范围内
  const clampedProgress = Math.min(Math.max(progress, 0), 100)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-[400px] max-w-[90vw] bg-white rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
        {/* 标题和取消按钮 */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-800">正在预测...</h3>
          {onCancel && (
            <button
              onClick={onCancel}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors duration-200"
              title="取消预测"
            >
              <X className="w-4 h-4" />
              取消
            </button>
          )}
        </div>

        {/* 进度信息 */}
        <div className="flex items-center justify-between mb-3 text-sm">
          <span className="text-gray-600">
            已处理: <span className="font-medium text-gray-800">{current}</span> / {total}
          </span>
          <span className="font-semibold text-blue-600">{clampedProgress.toFixed(1)}%</span>
        </div>

        {/* 进度条容器 */}
        <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
          {/* 进度条填充 */}
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${clampedProgress}%` }}
          >
            {/* 进度条光效动画 */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
          </div>
        </div>

        {/* 状态提示 */}
        <p className="mt-3 text-xs text-gray-500 text-center">
          {clampedProgress >= 100 ? '预测完成' : '正在处理数据，请稍候...'}
        </p>
      </div>
    </div>
  )
}

export default ProgressBar
