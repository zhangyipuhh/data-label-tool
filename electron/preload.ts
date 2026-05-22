import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // 文件操作
  selectExcelFile: () => ipcRenderer.invoke('select-excel-file'),
  readExcel: (filePath: string) => ipcRenderer.invoke('read-excel', filePath),
  saveExcel: (params: {
    filePath: string
    headers: string[]
    rows: any[][]
    mode: 'overwrite' | 'ask'
  }) => ipcRenderer.invoke('save-excel', params),

  // 推理
  runInference: (columnData: string[], columnName: string) => 
    ipcRenderer.invoke('run-inference', columnData, columnName),

  // 反馈
  saveFeedback: (feedback: {
    inputText: string
    modelOutput: string
    confidence: number
    userConfirm: boolean
    correctedValue?: string
    columnName: string
    fileName: string
  }) => ipcRenderer.invoke('save-feedback', feedback),

  getFeedbackStats: () => ipcRenderer.invoke('get-feedback-stats'),
  exportFeedback: (format: 'json' | 'csv') => ipcRenderer.invoke('export-feedback', format),

  // 应用信息
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // 文件夹操作
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readDirectoryTree: (folderPath: string) => ipcRenderer.invoke('read-directory-tree', folderPath),

  // 监听主进程事件
  onFolderOpened: (callback: (data: { folderPath: string; tree: any[] }) => void) =>
    ipcRenderer.on('folder-opened', (_, data) => callback(data))
})

declare global {
  interface Window {
    electronAPI: {
      selectExcelFile: () => Promise<any>
      readExcel: (filePath: string) => Promise<any>
      saveExcel: (params: any) => Promise<any>
      runInference: (columnData: string[], columnName: string) => Promise<any>
      saveFeedback: (feedback: any) => Promise<any>
      getFeedbackStats: () => Promise<any>
      exportFeedback: (format: 'json' | 'csv') => Promise<any>
      getAppVersion: () => Promise<{ version: string }>
      selectFolder: () => Promise<any>
      readDirectoryTree: (folderPath: string) => Promise<any>
      onFolderOpened: (callback: (data: { folderPath: string; tree: any[] }) => void) => void
    }
  }
}
