!macro customInstall
  # 确保配置目录存在
  CreateDirectory "$INSTDIR\resources\config"

  # 调用 PowerShell 脚本进行自动配置
  # detect-python.ps1 已通过 extraResources 复制到 resources/build/
  nsExec::ExecToStack 'powershell -ExecutionPolicy Bypass -NoProfile -File "$INSTDIR\resources\build\detect-python.ps1" -AutoConfigure "$INSTDIR\resources\config\python_env_config.json"'
  Pop $0
  Pop $1

  ${If} $0 == "0"
    ${If} $1 == "AUTO_CONFIGURED"
      MessageBox MB_OK "[Python Environment] Auto-configured successfully.$\r$\n$\r$\nYou can change it later in Settings > Python Environment."
    ${Else}
      # 未检测到有效环境，确保空配置存在
      FileOpen $2 "$INSTDIR\resources\config\python_env_config.json" w
      FileWrite $2 '{"pythonPath": "", "sitePackagesPath": ""}'
      FileClose $2
      MessageBox MB_OK "[Python Environment] Not detected.$\r$\n$\r$\nNo Python environment with torch/transformers found. AI inference will be unavailable. Please configure manually in Settings > Python Environment after launch."
    ${EndIf}
  ${Else}
    # 脚本执行失败，写入空配置
    FileOpen $2 "$INSTDIR\resources\config\python_env_config.json" w
    FileWrite $2 '{"pythonPath": "", "sitePackagesPath": ""}'
    FileClose $2
  ${EndIf}
!macroend
