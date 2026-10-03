<#
.SYNOPSIS
    DeepSeek Harness (dsh) 安全联网启动器 —— 关端口 / 镜像查新 / 隐藏后台启动 / 健康检查。

.DESCRIPTION
    启动流程（每次运行都会执行）：
      1. 关闭占用 dsh 端口（默认 3080）的遗留进程，避免上次没关导致的端口冲突；
      2. 用国内镜像 registry.npmmirror.com 查询 @deepseek-ai/dsh 的最新版本；
      3. 若镜像上有更新版本 -> 先关端口再 npm 镜像安装更新；已是最新 -> 跳过；
         联网查询失败 -> 降级用本地已安装版本启动（不阻塞）；
      4. 打印本次真正要启动的版本；
      5. 以隐藏控制台窗口（后台）方式启动 `dsh web`，日志写入 dsh-web.log，
         终端不再显示在任务栏，避免误点关闭导致进程被杀；
      6. 轮询端口就绪后自动用默认浏览器打开 Web UI。

    关机：Web UI 右下角的电源按钮（由 dsh-power-launch 插件提供）会以退出码 0
    干净结束 dsh 宿主进程，端口随即释放，下次启动不冲突。

.PARAMETER Port
    dsh web 监听端口，默认 3080。清端口与启动都用这个值。

.PARAMETER Registry
    npm 镜像地址，默认 https://registry.npmmirror.com。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\dsh-launch.ps1
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\dsh-launch.ps1 -Port 3080
#>
[CmdletBinding()]
param(
    [int]    $Port     = 3080,
    [string] $Registry = 'https://registry.npmmirror.com',
    [string] $Package  = '@deepseek-ai/dsh',
    [string] $Profile  = 'web'
)

$ErrorActionPreference = 'Stop'
# 全程走镜像；避免直接 npx 拉包卡死。
$env:npm_config_registry = $Registry
$GlobalBin = Join-Path $env:APPDATA 'npm'
if ((($env:PATH) -split ';') -notcontains $GlobalBin) { $env:PATH = "$GlobalBin;$env:PATH" }

function Write-Info($m)  { Write-Host "[dsh-launch] $m" -ForegroundColor Cyan }
function Write-Ok($m)    { Write-Host "[dsh-launch] ✓ $m" -ForegroundColor Green }
function Write-Warn($m)  { Write-Host "[dsh-launch] ⚠ $m" -ForegroundColor Yellow }
function Write-Err($m)   { Write-Host "[dsh-launch] ✗ $m" -ForegroundColor Red }

# ────────────────────────────────────────────── 1. 关闭端口占用进程
function Stop-DshPort([int]$p) {
    $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) { Write-Info "端口 $p 空闲，无需清理。"; return }
    foreach ($procId in ($conns.OwningProcess | Sort-Object -Unique)) {
        try {
            $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName
            Write-Info "关闭占用端口 $p 的进程 PID=$procId ($name)。"
            Stop-Process -Id $procId -Force -ErrorAction Stop
        } catch {
            Write-Err "无法结束 PID=$procId：$_"
        }
    }
    $deadline = (Get-Date).AddSeconds(6)
    while ((Get-Date) -lt $deadline) {
        if (-not (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 300
    }
    Write-Ok "端口 $p 已释放。"
}

# ────────────────────────────────────────────── 版本读取 / 比较
function Get-InstalledVersion {
    $pkgDir = Join-Path $GlobalBin ("node_modules\" + ($Package -replace '/', '\'))
    $pj = Join-Path $pkgDir 'package.json'
    if (Test-Path $pj) { try { return (Get-Content $pj -Raw -Encoding UTF8 | ConvertFrom-Json).version } catch {} }
    return $null
}

function Get-LatestVersion([string]$pkg, [string]$reg) {
    $curl = Join-Path $env:SystemRoot 'System32\curl.exe'
    if (-not (Test-Path $curl)) { $curl = 'curl.exe' }
    $url = "$reg/$pkg"
    # 先取精简元数据(install-v1)，失败再退到完整文档；--max-time 防止联网卡死。
    foreach ($hdr in 'application/vnd.npm.install-v1+json', 'application/json') {
        try {
            $json = & $curl -s --max-time 12 -H "Accept: $hdr" $url 2>$null
            if ($LASTEXITCODE -eq 0 -and $json) {
                $obj = $json | ConvertFrom-Json
                $v = $obj.'dist-tags'.latest
                if (-not $v -and $obj.version) { $v = $obj.version }
                if ($v) { return $v }
            }
        } catch { }
    }
    return $null
}

function Split-SemVer([string]$v) {
    if ($v -match '^(\d+)\.(\d+)\.(\d+)(?:[-+](.+))?$') {
        return [pscustomobject]@{
            Major = [int]$Matches[1]; Minor = [int]$Matches[2]; Patch = [int]$Matches[3]; Pre = $Matches[4]
        }
    }
    return $null
}

# 返回 >0 表示 $newer 比 $older 新。核心号优先，正式版 > 预发布版。
# 参数名不要用 $a/$b：PowerShell 变量名大小写不敏感，会与函数体内的局部
# $A/$B 撞成同一个变量，而 [string] 约束会把 Split-SemVer 返回的对象强转成
# 字符串，三个核心号的比较就全部退化成相等、恒返回 0（误判"已是最新"）。
function Compare-SemVer([string]$newer, [string]$older) {
    $A = Split-SemVer $newer; $B = Split-SemVer $older
    if (-not $A -or -not $B) { return 0 }
    foreach ($n in 'Major', 'Minor', 'Patch') {
        if ($A.$n -ne $B.$n) { return $A.$n - $B.$n }
    }
    if (-not $A.Pre -and $B.Pre) { return 1 }
    if ($A.Pre -and -not $B.Pre) { return -1 }
    if (-not $A.Pre -and -not $B.Pre) { return 0 }
    return [int][Math]::Sign([string]::CompareOrdinal($A.Pre, $B.Pre))
}

# ────────────────────────────────────────────── 主流程
Write-Host ""
Write-Host "══════════════ DeepSeek Harness 启动器 ══════════════" -ForegroundColor White
Write-Host "  镜像: $Registry" -ForegroundColor DarkGray
Write-Host ""

# 1. 关端口
Stop-DshPort $Port

# 2~3. 查新版本并按需更新
$installed = Get-InstalledVersion
$latest    = Get-LatestVersion $Package $Registry
Write-Info ("本地已安装: " + $(if ($installed) { "v$installed" } else { "未安装" }))
if ($latest) {
    Write-Info ("镜像最新:   v$latest")
    $needUpdate = (-not $installed) -or ((Compare-SemVer $latest $installed) -gt 0)
    if ($needUpdate) {
        Write-Info "发现新版本，正在通过镜像安装 @v$latest ..."
        try {
            & npm install -g "$Package@$latest" --registry $Registry --no-audit --no-fund --loglevel=error
            if ($LASTEXITCODE -eq 0) {
                $installed = Get-InstalledVersion
                Write-Ok "更新完成 -> v$installed"
            } else {
                Write-Warn "安装失败(退出码 $LASTEXITCODE)，降级用本地版本启动。"
            }
        } catch {
            Write-Warn "安装异常：$_，降级用本地版本启动。"
        }
    } else {
        Write-Ok "已是最新，无需更新。"
    }
} else {
    Write-Warn "无法联网获取最新版本(镜像波动/离线)。降级：使用本地已安装版本启动。"
}

# 4. 确认最终启动版本
$finalVer = Get-InstalledVersion
if (-not $finalVer) { Write-Err "未检测到可用的 dsh 安装，无法启动。"; exit 1 }
Write-Host ""
Write-Host ("  即将启动:  dsh web   ——   版本 v$finalVer   ——   端口 $Port" ) -ForegroundColor Green
Write-Host ""

# 5. 隐藏控制台后台启动：交给 dsh-web-run.bat（脚本内自带 > 日志 重定向），
#    再用 WScript.Shell 以窗口样式 0（隐藏）拉起，脱离本终端、无法被误点关闭。
$logFile = Join-Path $PSScriptRoot 'dsh-web.log'
$runBat  = Join-Path $PSScriptRoot 'dsh-web-run.bat'
if (-not (Test-Path $runBat)) { Write-Err "缺少 $runBat"; exit 1 }
# 记下启动前的日志行数：dsh 0.2+ 的 Web UI 地址带一次性 token（每次启动都变），
# 只能从本次启动写进日志的那行 "dsh web: http://..." 里取，旧 token 会失效。
$logLinesBefore = if (Test-Path $logFile) { @(Get-Content $logFile -Encoding UTF8 -ErrorAction SilentlyContinue).Count } else { 0 }
try {
    $ws = New-Object -ComObject WScript.Shell
    # Run(command, windowStyle=0 隐藏, waitOnReturn=$false 不阻塞)
    $ws.Run("`"$runBat`" $Port", 0, $false) | Out-Null
} catch {
    Write-Err "启动隐藏进程失败：$_"; exit 1
}

# 6. 健康检查 + 打开浏览器
Write-Info "等待 Web UI 就绪 (最多约 60s) ..."
$ready = $false
for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Milliseconds 500
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { $ready = $true; break }
}
if ($ready) {
    # 从本次启动写进日志的那行取 dsh 打印的地址（含 token）；取不到就退回裸地址。
    $url = "http://127.0.0.1:$Port"
    for ($i = 0; $i -lt 10; $i++) {
        $fresh = @(Get-Content $logFile -Encoding UTF8 -ErrorAction SilentlyContinue | Select-Object -Skip $logLinesBefore)
        $hit = $fresh | Select-String -Pattern 'dsh web:\s*(https?://\S+)' | Select-Object -Last 1
        if ($hit) { $url = $hit.Matches[0].Groups[1].Value.Trim(); break }
        Start-Sleep -Milliseconds 500
    }
    Write-Ok "Web UI 就绪: $url  (v$finalVer)"
    Write-Info "正在打开默认浏览器 ..."
    Start-Process $url
    Write-Host ""
    Write-Host "  dsh 已在后台隐藏运行（无可见终端，不会被误关）。" -ForegroundColor DarkGray
    Write-Host "  需要退出时，点 Web UI 右下角的电源按钮即可干净关机并释放端口。" -ForegroundColor DarkGray
    Write-Host "════════════════════════════════════════════════════" -ForegroundColor White
    # 启动成功后本窗口才退场（后台化）；启动前全程可见以便查看进度。
    for ($s = 5; $s -ge 1; $s--) { Write-Host ("  {0} 秒后自动关闭本窗口..." -f $s); Start-Sleep 1 }
    exit 0
} else {
    Write-Err "启动超时：端口 $Port 未监听。"
    if (Test-Path $logFile) {
        Write-Host "----- $logFile 末尾 -----" -ForegroundColor DarkGray
        Get-Content $logFile -Tail 25 | ForEach-Object { Write-Host $_ }
    }
    exit 1
}
