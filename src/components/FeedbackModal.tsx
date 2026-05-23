import React, { useState, useEffect } from 'react'
import { Send, X } from 'lucide-react'

/**
 * FeedbackModal 组件 Props 接口
 */
interface FeedbackModalProps {
  /** 控制弹窗显示/隐藏 */
  visible: boolean
  /** 源字段（缩写），只读显示 */
  sourceField: string
  /** 预测结果，只读显示 */
  predictedResult: string
  /**
   * 提交反馈按钮回调
   * @param actualContent - 用户输入的实际内容，若为空则默认使用预测结果
   */
  onSubmit: (actualContent: string) => void
  /** 取消按钮回调，关闭弹窗 */
  onCancel: () => void
}

/**
 * 反馈弹窗组件
 * 用于显示推理结果的反馈界面，支持确认正确或提交修正内容
 * @param props - 组件属性
 * @returns React 组件
 */
const FeedbackModal: React.FC<FeedbackModalProps> = ({
  visible,
  sourceField,
  predictedResult,
  onSubmit,
  onCancel
}) => {
  // 实际内容输入状态
  const [actualContent, setActualContent] = useState('')
  /**
   * 是否正在播放退出动画
   * 用于控制组件卸载前的淡出效果
   */
  const [isExiting, setIsExiting] = useState(false)
  /**
   * 是否真正渲染组件
   * 在退出动画播放期间保持为 true
   */
  const [shouldRender, setShouldRender] = useState(visible)

  // 当弹窗显示时，重置输入框
  useEffect(() => {
    if (visible) {
      setActualContent('')
    }
  }, [visible])

  /**
   * 监听 visible 属性变化，管理入场和出场动画
   */
  useEffect(() => {
    if (visible) {
      // 需要显示：立即设置渲染状态，关闭退出状态
      setIsExiting(false)
      setShouldRender(true)
    } else {
      // 需要隐藏：启动退出动画
      setIsExiting(true)
      // 等待动画完成后卸载组件
      const timer = setTimeout(() => {
        setShouldRender(false)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [visible])

  // 处理提交反馈
  const handleSubmit = () => {
    onSubmit(actualContent.trim())
    setActualContent('')
  }

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel()
    } else if (e.key === 'Enter' && e.ctrlKey) {
      // Ctrl+Enter 快捷提交
      handleSubmit()
    }
  }

  // 如果不可见且不处于退出动画，不渲染任何内容
  if (!shouldRender) {
    return null
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${
        isExiting ? 'animate-fade-out' : 'animate-fade-in'
      }`}
      onKeyDown={handleKeyDown}
    >
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />

      {/* 弹窗主体 */}
      <div
        className={`relative w-[500px] h-[400px] bg-white rounded-xl shadow-2xl ${
          isExiting ? 'animate-zoom-out-fade' : 'animate-zoom-in-fade'
        }`}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">结果反馈</h3>
          <button
            onClick={onCancel}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="px-6 py-4 space-y-4">
          {/* 源字段（只读） */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              源字段
            </label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 truncate">
              {sourceField || '(空)'}
            </div>
          </div>

          {/* 预测结果（只读） */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              预测结果
            </label>
            <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 truncate">
              {predictedResult || '(空)'}
            </div>
          </div>

          {/* 实际内容输入框 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              实际内容
              <span className="text-gray-400 font-normal ml-1">（用户确认的正确内容）</span>
            </label>
            <input
              type="text"
              value={actualContent}
              onChange={(e) => setActualContent(e.target.value)}
              placeholder="输入正确的实际内容..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              autoFocus
            />
            <p className="mt-1 text-xs text-gray-400">
              提示：按 Ctrl+Enter 可快速提交反馈；不填写则默认采用预测结果
            </p>
          </div>
        </div>

        {/* 底部按钮区域 */}
        <div className="absolute bottom-0 left-0 right-0 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <div className="flex items-center justify-end gap-3">
            {/* 取消按钮 */}
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              取消
            </button>

            {/* 提交反馈按钮 */}
            <button
              onClick={handleSubmit}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Send className="w-4 h-4" />
              提交反馈
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FeedbackModal
