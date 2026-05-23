import React, { useState, useEffect } from 'react'
import { X, Cpu, Filter, Plus, Trash2, Save, AlertTriangle } from 'lucide-react'

/**
 * 设置面板导航项类型
 */
type SettingsTab = 'gpu' | 'filter'

/**
 * 精确匹配规则项接口
 * @property from - 原值（缩写）
 * @property to - 替换值（全称）
 */
interface ExactMatchItem {
  from: string
  to: string
}

/**
 * GPU 配置接口
 * @property device - 计算设备（auto / cpu / cuda）
 * @property cuda_visible_devices - CUDA 可见设备字符串
 */
interface GpuConfig {
  device: string
  cuda_visible_devices: string
}

/**
 * SettingsModal 组件 Props 接口
 */
interface SettingsModalProps {
  /** 控制弹窗显示/隐藏 */
  visible: boolean
  /** 关闭弹窗回调 */
  onClose: () => void
  /** 消息提示回调 */
  onMessage: (msg: string) => void
}

/**
 * 全局设置面板组件
 * 左侧导航切换 GPU 设置和过滤规则设置
 * @param props - 组件属性
 * @returns React 组件
 */
const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
  onMessage
}) => {
  /** 当前激活的导航项 */
  const [activeTab, setActiveTab] = useState<SettingsTab>('gpu')
  /** 是否正在退出动画 */
  const [isExiting, setIsExiting] = useState(false)
  /** 是否真正渲染组件 */
  const [shouldRender, setShouldRender] = useState(visible)

  // GPU 配置状态
  const [gpuConfig, setGpuConfig] = useState<GpuConfig>({ device: 'auto', cuda_visible_devices: '' })
  const [gpuLoading, setGpuLoading] = useState(false)

  // 过滤规则配置状态
  const [exactMatchItems, setExactMatchItems] = useState<ExactMatchItem[]>([])
  const [prefixes, setPrefixes] = useState<string[]>([])
  const [filterLoading, setFilterLoading] = useState(false)

  // 重启提示状态
  const [showRestartHint, setShowRestartHint] = useState(false)

  /**
   * 监听 visible 属性变化，管理入场和出场动画
   */
  useEffect(() => {
    if (visible) {
      setIsExiting(false)
      setShouldRender(true)
      setShowRestartHint(false)
      loadConfigs()
    } else {
      setIsExiting(true)
      const timer = setTimeout(() => setShouldRender(false), 200)
      return () => clearTimeout(timer)
    }
  }, [visible])

  /**
   * 加载所有配置
   */
  const loadConfigs = async () => {
    await loadGpuConfig()
    await loadFilterConfig()
  }

  /**
   * 加载 GPU 配置
   */
  const loadGpuConfig = async () => {
    if (!window.electronAPI) return
    try {
      setGpuLoading(true)
      const result = await window.electronAPI.readGpuConfig()
      if (result.success && result.config) {
        setGpuConfig({
          device: result.config.device || 'auto',
          cuda_visible_devices: result.config.cuda_visible_devices || ''
        })
      }
    } catch (error) {
      console.error('加载 GPU 配置失败:', error)
    } finally {
      setGpuLoading(false)
    }
  }

  /**
   * 加载过滤规则配置
   */
  const loadFilterConfig = async () => {
    if (!window.electronAPI) return
    try {
      setFilterLoading(true)
      const result = await window.electronAPI.readFilterConfig()
      if (result.success && result.config) {
        const rules = result.config.rules || {}
        const exactItems = (rules.exact_match?.items || []).map((item: any) => ({
          from: item.from || '',
          to: item.to || ''
        }))
        const prefixList = rules.prefix_match?.prefixes || []
        setExactMatchItems(exactItems)
        setPrefixes(prefixList)
      }
    } catch (error) {
      console.error('加载过滤规则配置失败:', error)
    } finally {
      setFilterLoading(false)
    }
  }

  /**
   * 保存 GPU 配置
   */
  const handleSaveGpu = async () => {
    if (!window.electronAPI) return
    try {
      setGpuLoading(true)
      const result = await window.electronAPI.saveGpuConfig(gpuConfig)
      if (result.success) {
        onMessage('✅ GPU 配置已保存，重启应用后生效')
        setShowRestartHint(true)
      } else {
        onMessage(`❌ 保存 GPU 配置失败: ${result.message}`)
      }
    } catch (error) {
      onMessage(`❌ 保存 GPU 配置失败: ${error}`)
    } finally {
      setGpuLoading(false)
    }
  }

  /**
   * 保存过滤规则配置
   */
  const handleSaveFilter = async () => {
    if (!window.electronAPI) return
    try {
      setFilterLoading(true)
      const config = {
        description: '缩写识别过滤配置',
        version: '1.0.0',
        rules: {
          exact_match: {
            description: '精确匹配替换规则，匹配成功直接返回替换值，置信度100%',
            items: exactMatchItems.filter(item => item.from.trim())
          },
          prefix_match: {
            description: '前缀匹配规则，匹配成功返回原值，不进行模型识别',
            prefixes: prefixes.filter(p => p.trim())
          }
        }
      }
      const result = await window.electronAPI.saveFilterConfig(config)
      if (result.success) {
        onMessage('✅ 过滤规则配置已保存并重载')
      } else {
        onMessage(`❌ 保存过滤规则配置失败: ${result.message}`)
      }
    } catch (error) {
      onMessage(`❌ 保存过滤规则配置失败: ${error}`)
    } finally {
      setFilterLoading(false)
    }
  }

  /**
   * 添加精确匹配规则项
   */
  const handleAddExactMatch = () => {
    setExactMatchItems([...exactMatchItems, { from: '', to: '' }])
  }

  /**
   * 删除精确匹配规则项
   * @param index - 要删除的项索引
   */
  const handleRemoveExactMatch = (index: number) => {
    setExactMatchItems(exactMatchItems.filter((_, i) => i !== index))
  }

  /**
   * 更新精确匹配规则项
   * @param index - 要更新的项索引
   * @param field - 字段名（from 或 to）
   * @param value - 新值
   */
  const handleUpdateExactMatch = (index: number, field: 'from' | 'to', value: string) => {
    const newItems = [...exactMatchItems]
    newItems[index] = { ...newItems[index], [field]: value }
    setExactMatchItems(newItems)
  }

  /**
   * 添加前缀匹配规则项
   */
  const handleAddPrefix = () => {
    setPrefixes([...prefixes, ''])
  }

  /**
   * 删除前缀匹配规则项
   * @param index - 要删除的项索引
   */
  const handleRemovePrefix = (index: number) => {
    setPrefixes(prefixes.filter((_, i) => i !== index))
  }

  /**
   * 更新前缀匹配规则项
   * @param index - 要更新的项索引
   * @param value - 新值
   */
  const handleUpdatePrefix = (index: number, value: string) => {
    const newPrefixes = [...prefixes]
    newPrefixes[index] = value
    setPrefixes(newPrefixes)
  }

  /**
   * 处理保存按钮点击
   */
  const handleSave = () => {
    if (activeTab === 'gpu') {
      handleSaveGpu()
    } else {
      handleSaveFilter()
    }
  }

  /**
   * 处理键盘事件
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

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
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* 弹窗主体 */}
      <div
        className={`relative w-[700px] h-[520px] bg-white rounded-xl shadow-2xl flex flex-col ${
          isExiting ? 'animate-zoom-out-fade' : 'animate-zoom-in-fade'
        }`}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-800">全局设置</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 主体内容：左侧导航 + 右侧设置区域 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧导航 */}
          <div className="w-[140px] border-r border-gray-200 bg-gray-50 py-3 flex-shrink-0">
            <nav className="space-y-1 px-2">
              <button
                onClick={() => setActiveTab('gpu')}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg transition-colors ${
                  activeTab === 'gpu'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                }`}
              >
                <Cpu className="w-4 h-4" />
                GPU 设置
              </button>
              <button
                onClick={() => setActiveTab('filter')}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg transition-colors ${
                  activeTab === 'filter'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                }`}
              >
                <Filter className="w-4 h-4" />
                过滤规则
              </button>
            </nav>
          </div>

          {/* 右侧设置内容 */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'gpu' ? (
              /* GPU 设置内容 */
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    计算设备
                  </label>
                  <select
                    value={gpuConfig.device}
                    onChange={(e) => setGpuConfig({ ...gpuConfig, device: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                  >
                    <option value="auto">自动检测</option>
                    <option value="cpu">CPU</option>
                    <option value="cuda">CUDA (GPU)</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-400">
                    选择模型推理使用的计算设备，"自动检测"将优先使用 GPU
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    CUDA 可见设备
                  </label>
                  <input
                    type="text"
                    value={gpuConfig.cuda_visible_devices}
                    onChange={(e) => setGpuConfig({ ...gpuConfig, cuda_visible_devices: e.target.value })}
                    placeholder="如: 0 或 0,1（留空使用所有 GPU）"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    指定可见的 GPU 设备编号，多卡时用逗号分隔
                  </p>
                </div>

                {showRestartHint && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-700">
                      <p className="font-medium">需要重启应用才能生效</p>
                      <p className="text-xs mt-0.5">GPU 配置在应用启动时加载，修改后请关闭并重新打开应用</p>
                    </div>
                  </div>
                )}

                {!showRestartHint && (
                  <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-600">GPU 配置修改后需要重启应用才能生效</p>
                  </div>
                )}
              </div>
            ) : (
              /* 过滤规则设置内容 */
              <div className="space-y-6">
                {/* 精确匹配规则 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">
                      精确匹配规则
                    </label>
                    <button
                      onClick={handleAddExactMatch}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" /> 添加
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">匹配成功直接返回替换值，置信度 100%</p>
                  {exactMatchItems.length === 0 ? (
                    <div className="text-sm text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">
                      暂无规则，点击"添加"创建
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[140px] overflow-y-auto">
                      {exactMatchItems.map((item, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={item.from}
                            onChange={(e) => handleUpdateExactMatch(index, 'from', e.target.value)}
                            placeholder="原值（缩写）"
                            className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          />
                          <span className="text-gray-400 text-sm">→</span>
                          <input
                            type="text"
                            value={item.to}
                            onChange={(e) => handleUpdateExactMatch(index, 'to', e.target.value)}
                            placeholder="替换值（全称）"
                            className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          />
                          <button
                            onClick={() => handleRemoveExactMatch(index)}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 前缀匹配规则 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">
                      前缀匹配规则
                    </label>
                    <button
                      onClick={handleAddPrefix}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" /> 添加
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">匹配成功返回原值，不进行模型识别</p>
                  {prefixes.length === 0 ? (
                    <div className="text-sm text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">
                      暂无规则，点击"添加"创建
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[140px] overflow-y-auto">
                      {prefixes.map((prefix, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={prefix}
                            onChange={(e) => handleUpdatePrefix(index, e.target.value)}
                            placeholder="前缀（如 SHAPE）"
                            className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all uppercase"
                          />
                          <button
                            onClick={() => handleRemovePrefix(index)}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <Save className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-green-600">过滤规则保存后立即生效，无需重启应用</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 底部按钮区域 */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex-shrink-0">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={gpuLoading || filterLoading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
