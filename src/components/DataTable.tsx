import React, { useState, useRef, useCallback } from 'react'
import { ArrowUpDown } from 'lucide-react'
import { ExcelData } from '../App'

interface Props {
  data: ExcelData
  selectedColumn: number | null
  onColumnSelect: (index: number) => void
  onCellEdit: (rowIndex: number, colIndex: number, newValue: string) => void
}

const DataTable: React.FC<Props> = ({ data, selectedColumn, onColumnSelect, onCellEdit }) => {
  const [editingCell, setEditingCell] = useState<{row: number; col: number} | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // 只显示前 200 行
  const displayRows = data.rows.slice(0, 200)
  const hasMore = data.rows.length > 200

  // 开始编辑
  const startEdit = useCallback((rowIndex: number, colIndex: number, currentValue: string) => {
    setEditingCell({ row: rowIndex, col: colIndex })
    setEditValue(String(currentValue || ''))
    // 下一帧聚焦输入框
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  // 保存编辑
  const saveEdit = useCallback(() => {
    if (editingCell) {
      onCellEdit(editingCell.row, editingCell.col, editValue)
      setEditingCell(null)
      setEditValue('')
    }
  }, [editingCell, editValue, onCellEdit])

  // 取消编辑
  const cancelEdit = useCallback(() => {
    setEditingCell(null)
    setEditValue('')
  }, [])

  // 键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }, [saveEdit, cancelEdit])

  return (
    <div className="table-container max-h-[600px] border border-gray-200 rounded-lg">
      <table className="data-table w-full text-sm">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="w-10 text-center bg-gray-100 border-b border-gray-200 px-2 py-2 text-xs text-gray-500">
              #
            </th>
            {data.headers.map((header, index) => (
              <th 
                key={index}
                className={`bg-gray-100 border-b border-gray-200 px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors select-none whitespace-nowrap ${
                  selectedColumn === index ? 'bg-blue-100 text-blue-700 border-blue-300' : ''
                }`}
                onClick={() => onColumnSelect(index)}
                title="点击选择此列进行推理"
              >
                <div className="flex items-center gap-1">
                  <span>{header || `列 ${index + 1}`}</span>
                  <ArrowUpDown className="w-3 h-3 opacity-40" />
                </div>
                {selectedColumn === index && (
                  <span className="ml-1 text-[10px] bg-blue-600 text-white px-1 py-0.5 rounded">
                    已选
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-gray-50">
              <td className="text-center text-gray-400 text-xs border-b border-gray-100 px-2 py-1.5 bg-gray-50">
                {rowIndex + 1}
              </td>
              {data.headers.map((_, colIndex) => {
                const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex
                const cellValue = String(row[colIndex] || '')
                const isSelectedCol = selectedColumn === colIndex

                return (
                  <td 
                    key={colIndex}
                    className={`border-b border-gray-100 px-2 py-1.5 min-w-[80px] ${
                      isSelectedCol ? 'bg-blue-50/50' : ''
                    }`}
                    onDoubleClick={() => startEdit(rowIndex, colIndex, cellValue)}
                    title="双击编辑"
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          ref={inputRef}
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onBlur={saveEdit}
                          className="w-full px-2 py-1 text-sm border-2 border-blue-500 rounded focus:outline-none"
                        />
                      </div>
                    ) : (
                      <span className="cursor-text hover:text-blue-600 transition-colors">
                        {cellValue}
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {hasMore && (
        <div className="text-center py-2 text-sm text-gray-500 bg-gray-50 border-t">
          还有 {data.rows.length - 200} 行数据未显示（共 {data.rows.length} 行）
        </div>
      )}
    </div>
  )
}

export default DataTable
