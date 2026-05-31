#Requires -Version 5.1
param([switch]$Scan, [string]$Validate, [string]$GetSitePackages, [string]$AutoConfigure)
$ErrorActionPreference = 'Stop'

function Out-Json($d) { $d | ConvertTo-Json -Depth 10 -Compress }
function Test-Py($p) {
    if (-not $p -or -not (Test-Path $p)) { return $false }
    try { $o = & $p "--version" 2>&1; return ($LASTEXITCODE -eq 0) } catch { return $false }
}

function Get-CondaEnvs {
    $r = @()
    try {
        $c = Get-Command conda -EA SilentlyContinue
        if ($c) {
            $i = & conda info --json 2>$null | ConvertFrom-Json
            if ($i.envs) {
                foreach ($e in $i.envs) {
                    $py = Join-Path $e "python.exe"
                    if (Test-Path $py) {
                        $n = if ($e -eq $i.root_prefix) { "base" } else { Split-Path $e -Leaf }
                        $r += @{ path = $py; type = "conda"; envName = $n }
                    }
                }
            }
        }
    } catch {}
    $roots = @("$env:USERPROFILE\anaconda3","$env:USERPROFILE\miniconda3","$env:LOCALAPPDATA\Continuum\anaconda3","$env:LOCALAPPDATA\Continuum\miniconda3","C:\ProgramData\anaconda3","C:\ProgramData\miniconda3","C:\anaconda3","C:\miniconda3")
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        $b = Join-Path $root "python.exe"
        if (Test-Path $b) {
            $x = $r | Where-Object { $_.path -eq $b }
            if (-not $x) { $r += @{ path = $b; type = "conda"; envName = "base" } }
        }
        $ed = Join-Path $root "envs"
        if (Test-Path $ed) {
            Get-ChildItem -Path $ed -Directory -EA SilentlyContinue | ForEach-Object {
                $py = Join-Path $_.FullName "python.exe"
                if (Test-Path $py) {
                    $x = $r | Where-Object { $_.path -eq $py }
                    if (-not $x) { $r += @{ path = $py; type = "conda"; envName = $_.Name } }
                }
            }
        }
    }
    return $r
}

function Get-SystemPythons {
    $r = @()
    try { & where.exe python 2>$null | ForEach-Object { $t = $_.Trim(); if ($t -and (Test-Path $t)) { $r += @{ path = $t; type = "system"; envName = "" } } } } catch {}
    $cp = @("C:\Python311\python.exe","C:\Python310\python.exe","C:\Python39\python.exe","C:\Python312\python.exe","$env:LOCALAPPDATA\Programs\Python\Python311\python.exe","$env:LOCALAPPDATA\Programs\Python\Python310\python.exe","$env:LOCALAPPDATA\Programs\Python\Python39\python.exe","$env:LOCALAPPDATA\Programs\Python\Python312\python.exe")
    foreach ($p in $cp) { if (Test-Path $p) { $x = $r | Where-Object { $_.path -eq $p }; if (-not $x) { $r += @{ path = $p; type = "system"; envName = "" } } } }
    return $r
}

function Validate-Py($PythonPath) {
    $res = @{ valid = $false; torchVersion = $null; transformersVersion = $null; tokenizersVersion = $null; safetensorsVersion = $null; error = $null }
    if (-not (Test-Py $PythonPath)) { $res.error = "Invalid Python path"; return $res }

    $tmpFile = [System.IO.Path]::GetTempFileName() + ".py"
    @"
import sys, json
r = {"valid": False, "missing": []}
try:
    import torch
    r["torchVersion"] = torch.__version__
except ImportError:
    r["missing"].append("torch")
try:
    import transformers
    r["transformersVersion"] = transformers.__version__
except ImportError:
    r["missing"].append("transformers")
try:
    import tokenizers
    r["tokenizersVersion"] = tokenizers.__version__
except ImportError:
    r["missing"].append("tokenizers")
try:
    import safetensors
    r["safetensorsVersion"] = safetensors.__version__
except ImportError:
    r["missing"].append("safetensors")
r["valid"] = len(r["missing"]) == 0
print(json.dumps(r, ensure_ascii=False))
"@ | Set-Content -Path $tmpFile -Encoding UTF8

    try {
        $out = & $PythonPath $tmpFile 2>&1 | Out-String
        $j = $out.Trim() | ConvertFrom-Json
        $res.valid = $j.valid
        $res.torchVersion = $j.torchVersion
        $res.transformersVersion = $j.transformersVersion
        $res.tokenizersVersion = $j.tokenizersVersion
        $res.safetensorsVersion = $j.safetensorsVersion
        if (-not $res.valid) { $res.error = "Missing: $($j.missing -join ', ')" }
    } catch { $res.error = "Validation error: $_" }
    finally { if (Test-Path $tmpFile) { Remove-Item $tmpFile -Force } }
    return $res
}

function Get-SitePkg($PythonPath) {
    if (-not (Test-Py $PythonPath)) { return $null }
    try {
        $out = & $PythonPath -c "import site; print(site.getsitepackages()[0] if site.getsitepackages() else site.getusersitepackages())" 2>$null | Out-String
        $t = $out.Trim()
        if ($t -and (Test-Path $t)) { return $t }
    } catch {}
    try {
        $out = & $PythonPath -c "import sys; [print(p) for p in sys.path if 'site-packages' in p]" 2>$null | Out-String
        $t = ($out.Split([Environment]::NewLine) | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1).Trim()
        if ($t -and (Test-Path $t)) { return $t }
    } catch {}
    return $null
}

if ($Scan) {
    $all = @()
    foreach ($e in (Get-CondaEnvs)) { $v = Validate-Py $e.path; $all += [ordered]@{ path = $e.path; type = $e.type; envName = $e.envName; valid = $v.valid; torchVersion = $v.torchVersion; transformersVersion = $v.transformersVersion; tokenizersVersion = $v.tokenizersVersion; safetensorsVersion = $v.safetensorsVersion; error = $v.error } }
    foreach ($e in (Get-SystemPythons)) { $x = $all | Where-Object { $_.path -eq $e.path }; if ($x) { continue }; $v = Validate-Py $e.path; $all += [ordered]@{ path = $e.path; type = $e.type; envName = $e.envName; valid = $v.valid; torchVersion = $v.torchVersion; transformersVersion = $v.transformersVersion; tokenizersVersion = $v.tokenizersVersion; safetensorsVersion = $v.safetensorsVersion; error = $v.error } }
    $rec = -1
    for ($i = 0; $i -lt $all.Count; $i++) { if ($all[$i].valid) { if ($rec -eq -1 -or ($all[$i].type -eq 'conda' -and $all[$rec].type -ne 'conda')) { $rec = $i } } }
    Out-Json @{ environments = $all; recommended = $rec }
}
elseif ($Validate) { Out-Json (Validate-Py $Validate) }
elseif ($GetSitePackages) { $p = Get-SitePkg $GetSitePackages; Out-Json @{ pythonPath = $GetSitePackages; sitePackagesPath = $p; valid = ($p -ne $null) } }
elseif ($AutoConfigure) {
    $all = @()
    foreach ($e in (Get-CondaEnvs)) { $v = Validate-Py $e.path; $all += [ordered]@{ path = $e.path; type = $e.type; envName = $e.envName; valid = $v.valid; torchVersion = $v.torchVersion; transformersVersion = $v.transformersVersion; tokenizersVersion = $v.tokenizersVersion; safetensorsVersion = $v.safetensorsVersion; error = $v.error } }
    foreach ($e in (Get-SystemPythons)) { $x = $all | Where-Object { $_.path -eq $e.path }; if ($x) { continue }; $v = Validate-Py $e.path; $all += [ordered]@{ path = $e.path; type = $e.type; envName = $e.envName; valid = $v.valid; torchVersion = $v.torchVersion; transformersVersion = $v.transformersVersion; tokenizersVersion = $v.tokenizersVersion; safetensorsVersion = $v.safetensorsVersion; error = $v.error } }
    $rec = -1
    for ($i = 0; $i -lt $all.Count; $i++) { if ($all[$i].valid) { if ($rec -eq -1 -or ($all[$i].type -eq 'conda' -and $all[$rec].type -ne 'conda')) { $rec = $i } } }
    if ($rec -ge 0 -and $all[$rec].valid) {
        $pp = $all[$rec].path
        $sp = Get-SitePkg $pp
        $cfg = @{ pythonPath = $pp; sitePackagesPath = $sp } | ConvertTo-Json
        $cfg | Out-File -FilePath $AutoConfigure -Encoding utf8
        Write-Output "AUTO_CONFIGURED"
    } else {
        $cfg = @{ pythonPath = ""; sitePackagesPath = "" } | ConvertTo-Json
        $cfg | Out-File -FilePath $AutoConfigure -Encoding utf8
        Write-Output "NO_VALID_ENV"
    }
}
else { Out-Json @{ error = "Usage: -Scan | -Validate <path> | -GetSitePackages <path> | -AutoConfigure <configPath>" } }
