import React from 'react'
import { FileSpreadsheet, X } from 'lucide-react'

/**
 * Excel Tab数据接口
 */
export interface ExcelTab {
  id: string
  filePath: string
  fileName: string
  sheets: string[]
  activeSheetIndex: number
  excelData: {
    headers: string[]
    rows: any[][]
    fileName: string
    sheetName: string
    sheetIndex: number
  }
  hasUnsavedChanges: boolean
  selectedColumn: number | null
}

/**
 * ExcelTabs组件Props接口
 */
interface ExcelTabsProps {
  tabs: ExcelTab[]
  activeTabId: string | null
  onTabSelect: (tabId: string) => void
  onTabClose: (tabId: string) => void
}

/**
 * VSCode风格的Excel文件Tab栏组件
 * 显示所有打开的Excel文件Tab，支持切换和关闭
 * @param tabs - Tab列表
 * @param activeTabId - 当前激活的Tab ID
 * @param onTabSelect - Tab切换回调
 * @param onTabClose - Tab关闭回调
 */
const ExcelTabs: React.FC<ExcelTabsProps> = ({ tabs, activeTabId, onTabSelect, onTabClose }) => {
  if (tabs.length === 0) return null

  return (
    <div className="flex items-center bg-gray-100 border-b border-gray-200 flex-shrink-0 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            className={`
              flex items-center gap-2 px-3 py-2 text-sm cursor-pointer border-r border-gray-200 min-w-[140px] max-w-[200px] select-none
              ${isActive 
                ? 'bg-white text-blue-600 border-t-2 border-t-blue-500' 
                : 'text-gray-600 hover:bg-gray-200'
              }
            `}
            onClick={() => onTabSelect(tab.id)}
            title={tab.fileName}
          >
            <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
            <span className="truncate flex-1">{tab.fileName}</span>
            {tab.hasUnsavedChanges && (
              <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" title="未保存的更改" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onTabClose(tab.id)
              }}
              className="hover:bg-gray-200 rounded p-0.5 flex-shrink-0"
              title="关闭"
            >
              <X className="w-3 h-3 text-gray-400 hover:text-gray-600" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default ExcelTabs
