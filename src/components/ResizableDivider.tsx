import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * ResizableDivider 组件属性
 * @property onResize - 拖拽时的回调函数，参数为拖拽的像素差
 * @property onDoubleClick - 双击时的回调函数，用于折叠/展开面板
 * @property className - 额外的 CSS 类名
 */
interface ResizableDividerProps {
  onResize: (delta: number) => void
  onDoubleClick?: () => void
  className?: string
}

/**
 * 可拖拽的分隔条组件
 *
 * 功能：
 * - 鼠标拖拽调整相邻面板宽度
 * - 鼠标悬停显示高亮效果
 * - 双击可快速折叠/展开面板
 * - 拖拽时禁用页面文本选择
 *
 * @param props - 组件属性
 * @returns React 组件
 */
export default function ResizableDivider({
  onResize,
  onDoubleClick,
  className = '',
}: ResizableDividerProps) {
  /** 是否正在拖拽中 */
  const [isDragging, setIsDragging] = useState(false)
  /** 拖拽开始时的鼠标 X 坐标 */
  const startXRef = useRef(0)
  /** 是否已经触发过移动（用于区分点击和拖拽） */
  const hasMovedRef = useRef(false)

  /**
   * 处理鼠标按下事件
   * 开始拖拽，记录起始位置
   * @param e - 鼠标事件对象
   */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    startXRef.current = e.clientX
    hasMovedRef.current = false
    setIsDragging(true)
  }, [])

  /**
   * 处理鼠标移动事件
   * 计算拖拽差值并回调给父组件
   * @param e - 鼠标事件对象
   */
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current
      if (Math.abs(delta) > 0) {
        hasMovedRef.current = true
        startXRef.current = e.clientX
        onResize(delta)
      }
    },
    [onResize]
  )

  /**
   * 处理鼠标释放事件
   * 结束拖拽，恢复文本选择
   */
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  /**
   * 处理双击事件
   * 仅当没有发生过拖拽移动时才触发折叠/展开
   */
  const handleDoubleClick = useCallback(() => {
    if (!hasMovedRef.current && onDoubleClick) {
      onDoubleClick()
    }
  }, [onDoubleClick])

  /**
   * 监听全局鼠标事件
   * 拖拽期间监听 window 级别的 mousemove 和 mouseup
   */
  useEffect(() => {
    if (isDragging) {
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    } else {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  return (
    <div
      className={`
        relative flex items-center justify-center
        w-2 cursor-col-resize select-none
        transition-colors duration-150
        ${isDragging ? 'bg-blue-400/50' : 'hover:bg-gray-300/50'}
        ${className}
      `}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      title="拖拽调整宽度，双击折叠/展开"
    >
      {/* 视觉分隔线 */}
      <div
        className={`
          w-px h-full transition-colors duration-150
          ${isDragging ? 'bg-blue-500' : 'bg-gray-300'}
        `}
      />
    </div>
  )
}
