import React, { useEffect, useState } from 'react'
import { Database, CheckCircle, XCircle, TrendingUp } from 'lucide-react'

interface Stats {
  total: number
  confirmed: number
  rejected: number
}

const StatsPanel: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const result = await window.electronAPI.getFeedbackStats()
      if (result.success && result.stats) {
        setStats(result.stats)
      }
    } catch (error) {
      console.error('加载统计失败:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="card mb-4">
        <p className="text-sm text-gray-500">加载统计中...</p>
      </div>
    )
  }

  if (!stats) return null

  const confirmRate = stats.total > 0 ? ((stats.confirmed / stats.total) * 100).toFixed(1) : '0'

  return (
    <div className="card mb-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <TrendingUp className="w-4 h-4" />
        反馈统计
      </h3>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <Database className="w-5 h-5 text-blue-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-blue-700">{stats.total}</p>
          <p className="text-xs text-blue-600">总反馈数</p>
        </div>
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <CheckCircle className="w-5 h-5 text-green-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-green-700">{stats.confirmed}</p>
          <p className="text-xs text-green-600">确认正确</p>
        </div>
        <div className="text-center p-3 bg-red-50 rounded-lg">
          <XCircle className="w-5 h-5 text-red-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-red-700">{stats.rejected}</p>
          <p className="text-xs text-red-600">标记错误</p>
        </div>
      </div>
      <div className="mt-3 text-center">
        <span className="text-sm text-gray-600">
          确认率: <span className="font-semibold text-green-600">{confirmRate}%</span>
        </span>
      </div>
    </div>
  )
}

export default StatsPanel
