import React from 'react'
import { AlertTriangle, X } from 'lucide-react'

/**
 * 关闭Tab确认对话框Props接口
 */
interface CloseTabConfirmDialogProps {
  visible: boolean
  fileName: string
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

/**
 * 关闭未保存Tab时的确认对话框
 * 提供保存、不保存、取消三个选项
 * @param visible - 是否显示
 * @param fileName - 文件名
 * @param onSave - 保存按钮回调
 * @param onDiscard - 不保存按钮回调
 * @param onCancel - 取消按钮回调
 */
const CloseTabConfirmDialog: React.FC<CloseTabConfirmDialogProps> = ({
  visible,
  fileName,
  onSave,
  onDiscard,
  onCancel
}) => {
  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-[400px] max-w-[90vw]">
        {/* 标题栏 */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200">
          <AlertTriangle className="w-6 h-6 text-yellow-500" />
          <h3 className="text-lg font-semibold text-gray-900">未保存的更改</h3>
          <button onClick={onCancel} className="ml-auto hover:bg-gray-100 rounded p-1">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        
        {/* 内容 */}
        <div className="px-6 py-4">
          <p className="text-gray-600">
            文件 <span className="font-medium text-gray-900">"{fileName}"</span> 有未保存的更改，是否保存？
          </p>
        </div>
        
        {/* 按钮 */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            取消
          </button>
          <button
            onClick={onDiscard}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            不保存
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

export default CloseTabConfirmDialog
