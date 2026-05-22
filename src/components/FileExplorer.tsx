import { useState } from 'react'
import {
  Folder,
  FolderOpen,
  FileSpreadsheet,
  File,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'

/**
 * 文件树节点数据结构
 * @property name - 文件/文件夹名称
 * @property path - 文件/文件夹完整路径
 * @property type - 节点类型：文件或目录
 * @property children - 子节点列表（仅目录有）
 * @property isXlsx - 是否为 xlsx 文件
 */
interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
  isXlsx?: boolean
}

/**
 * FileExplorer 组件属性
 * @property tree - 目录树数据，为 null 表示未打开文件夹
 * @property selectedFilePath - 当前选中的 xlsx 文件路径
 * @property onFileSelect - 单击 xlsx 文件时的回调，参数为文件路径
 */
interface FileExplorerProps {
  tree: FileTreeNode[] | null
  selectedFilePath: string | null
  onFileSelect: (filePath: string) => void
}

/**
 * TreeNodeProps - 递归树节点组件属性
 * @property node - 当前树节点数据
 * @property depth - 当前节点缩进层级
 * @property selectedFilePath - 当前选中的 xlsx 文件路径
 * @property onFileSelect - 单击 xlsx 文件时的回调
 * @property expandedPaths - 已展开的文件夹路径集合
 * @property toggleExpand - 切换文件夹展开/折叠的回调
 */
interface TreeNodeProps {
  node: FileTreeNode
  depth: number
  selectedFilePath: string | null
  onFileSelect: (filePath: string) => void
  expandedPaths: Set<string>
  toggleExpand: (path: string) => void
}

/**
 * 递归渲染单个树节点
 * - 文件夹：显示展开/折叠箭头和文件夹图标，点击可展开/折叠
 * - xlsx 文件：显示蓝色表格图标，点击触发 onFileSelect
 * - 非 xlsx 文件：显示灰色文件图标，不可交互
 *
 * @param props - TreeNodeProps
 * @returns React 节点
 */
function TreeNode({
  node,
  depth,
  selectedFilePath,
  onFileSelect,
  expandedPaths,
  toggleExpand,
}: TreeNodeProps) {
  const isDirectory = node.type === 'directory'
  const isExpanded = expandedPaths.has(node.path)
  const isSelected = node.path === selectedFilePath

  /**
   * 处理节点点击事件
   * - 文件夹：切换展开/折叠状态
   * - xlsx 文件：触发 onFileSelect 回调
   * - 非 xlsx 文件：无操作
   */
  const handleClick = () => {
    if (isDirectory) {
      toggleExpand(node.path)
    } else if (node.isXlsx) {
      onFileSelect(node.path)
    }
  }

  return (
    <div>
      {/* 当前节点行 */}
      <div
        className={`
          flex items-center gap-1 py-[2px] px-2 cursor-pointer select-none
          text-[13px] leading-5
          ${isDirectory
            ? 'text-gray-300 hover:bg-gray-700/50'
            : node.isXlsx
              ? isSelected
                ? 'bg-blue-600/40 text-blue-300'
                : 'text-gray-300 hover:bg-gray-700/50'
              : 'text-gray-500 cursor-default hover:bg-transparent'
          }
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        title={node.path}
      >
        {/* 展开/折叠箭头：文件夹显示，文件占位 */}
        {isDirectory ? (
          isExpanded ? (
            <ChevronDown className="w-4 h-4 shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0 text-gray-400" />
          )
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* 节点图标 */}
        {isDirectory ? (
          isExpanded ? (
            <FolderOpen className="w-4 h-4 shrink-0 text-yellow-400" />
          ) : (
            <Folder className="w-4 h-4 shrink-0 text-yellow-400" />
          )
        ) : node.isXlsx ? (
          <FileSpreadsheet className="w-4 h-4 shrink-0 text-blue-400" />
        ) : (
          <File className="w-4 h-4 shrink-0 text-gray-500" />
        )}

        {/* 文件/文件夹名称，超长截断 */}
        <span className="truncate">{node.name}</span>
      </div>

      {/* 递归渲染子节点：仅文件夹且已展开时显示 */}
      {isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFilePath={selectedFilePath}
              onFileSelect={onFileSelect}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * VSCode 风格的文件系统浏览器组件
 * - 展示目录树，支持文件夹展开/折叠
 * - 单击 xlsx 文件触发加载回调
 * - 非 xlsx 文件显示为灰色不可交互
 * - tree 为 null 时显示空状态提示
 *
 * @param props - FileExplorerProps
 * @returns React 节点
 */
export default function FileExplorer({
  tree,
  selectedFilePath,
  onFileSelect,
}: FileExplorerProps) {
  /** 已展开的文件夹路径集合 */
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())

  /**
   * 切换文件夹展开/折叠状态
   * @param path - 文件夹路径
   */
  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-300">
      {/* 顶部标题栏 */}
      <div className="flex items-center gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-700/50">
        <FolderOpen className="w-4 h-4" />
        <span>资源管理器</span>
      </div>

      {/* 目录树内容区域 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {tree === null ? (
          /* 空状态：未打开文件夹 */
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
            <FolderOpen className="w-10 h-10" />
            <span className="text-sm">请打开文件夹</span>
          </div>
        ) : (
          /* 渲染目录树 */
          tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              selectedFilePath={selectedFilePath}
              onFileSelect={onFileSelect}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
            />
          ))
        )}
      </div>
    </div>
  )
}
