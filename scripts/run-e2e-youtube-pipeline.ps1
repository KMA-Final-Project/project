<#
.SYNOPSIS
Run the full local YouTube E2E pipeline against the real backend API flow.

.DESCRIPTION
Brings up local infra, starts backend API + backend worker + AI engine,
submits one or more YouTube cases through POST /media/youtube, waits for
completion, stores artifacts locally, and captures process logs in a single
run directory.
#>
[CmdletBinding()]
param(
    [string[]]$CaseIds = @("english_-moW9jvvMr4", "chinese_60xeAEe7H28"),
    [string]$TargetLanguage = "vi",
    [string]$OutputDir = "",
    [switch]$KeepProcesses
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $repoRoot "apps\backend-api"
$aiEnginePath = Join-Path $repoRoot "apps\ai-engine"
$pythonPath = Join-Path $aiEnginePath "venv\Scripts\python.exe"
$nodeScript = Join-Path $PSScriptRoot "manage-infra.mjs"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is required."
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    throw "pnpm is required."
}
if (-not (Test-Path $pythonPath)) {
    throw "AI engine Python interpreter not found at $pythonPath"
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $repoRoot "outputs\e2e-youtube-pipeline\$timestamp"
}

$logsDir = Join-Path $OutputDir "logs"
$resultsDir = Join-Path $OutputDir "results"
$null = New-Item -ItemType Directory -Force -Path $logsDir, $resultsDir

$backendLog = Join-Path $logsDir "backend-api.log"
$backendErr = Join-Path $logsDir "backend-api.err.log"
$workerLog = Join-Path $logsDir "backend-worker.log"
$workerErr = Join-Path $logsDir "backend-worker.err.log"
$aiLog = Join-Path $logsDir "ai-engine.log"
$aiErr = Join-Path $logsDir "ai-engine.err.log"

$startedProcesses = @()

function Start-LoggedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$ArgumentList,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$StdOutPath,
        [Parameter(Mandatory = $true)][string]$StdErrPath
    )

    return Start-Process `
        -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory `
        -RedirectStandardOutput $StdOutPath `
        -RedirectStandardError $StdErrPath `
        -WindowStyle Hidden `
        -PassThru
}

function Stop-StartedProcesses {
    foreach ($proc in $startedProcesses) {
        if ($null -ne $proc -and -not $proc.HasExited) {
            try {
                Stop-Process -Id $proc.Id -Force -ErrorAction Stop
            } catch {
                Write-Warning "Failed to stop process $($proc.Id): $_"
            }
        }
    }
}

function Wait-ForApi {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 90
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -Method Get -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return
            }
        } catch {
            Start-Sleep -Seconds 2
            continue
        }
        Start-Sleep -Seconds 2
    }

    throw "Timed out waiting for API readiness at $Url"
}

try {
    Write-Host "==> Bringing up local infra"
    & node $nodeScript up
    if ($LASTEXITCODE -ne 0) {
        throw "Infra startup failed."
    }

    Write-Host "==> Building backend"
    Push-Location $backendPath
    try {
        & pnpm build
        if ($LASTEXITCODE -ne 0) {
            throw "pnpm build failed."
        }
    } finally {
        Pop-Location
    }

    Write-Host "==> Starting backend API"
    $backendProc = Start-LoggedProcess `
        -FilePath "node" `
        -ArgumentList @("dist/src/main.js") `
        -WorkingDirectory $backendPath `
        -StdOutPath $backendLog `
        -StdErrPath $backendErr
    $startedProcesses += $backendProc

    Write-Host "==> Starting backend worker"
    $workerProc = Start-LoggedProcess `
        -FilePath "node" `
        -ArgumentList @("dist/src/worker.js") `
        -WorkingDirectory $backendPath `
        -StdOutPath $workerLog `
        -StdErrPath $workerErr
    $startedProcesses += $workerProc

    Write-Host "==> Starting AI engine"
    $aiProc = Start-LoggedProcess `
        -FilePath $pythonPath `
        -ArgumentList @("-m", "src.main") `
        -WorkingDirectory $aiEnginePath `
        -StdOutPath $aiLog `
        -StdErrPath $aiErr
    $startedProcesses += $aiProc

    Wait-ForApi -Url "http://localhost:3000/api/docs"
    Start-Sleep -Seconds 5

    foreach ($proc in $startedProcesses) {
        if ($proc.HasExited) {
            throw "A required process exited early. Check logs under $logsDir"
        }
    }

    Write-Host "==> Running E2E evaluator"
    Push-Location $backendPath
    try {
        $evalArgs = @(
            "exec", "tsx", "scripts/e2e-youtube-pipeline-eval.ts",
            "--output-dir", $resultsDir,
            "--target-language", $TargetLanguage
        )
        foreach ($caseId in $CaseIds) {
            $evalArgs += @("--case-id", $caseId)
        }

        & pnpm @evalArgs
        if ($LASTEXITCODE -ne 0) {
            throw "E2E evaluator failed."
        }
    } finally {
        Pop-Location
    }

    $manifest = @{
        startedAt = (Get-Date).ToString("o")
        outputDir = $OutputDir
        logsDir = $logsDir
        resultsDir = $resultsDir
        caseIds = $CaseIds
        targetLanguage = $TargetLanguage
        backendPid = $backendProc.Id
        workerPid = $workerProc.Id
        aiEnginePid = $aiProc.Id
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $OutputDir "run.manifest.json") -Encoding utf8

    Write-Host "E2E run complete."
    Write-Host "Logs:    $logsDir"
    Write-Host "Results: $resultsDir"
} finally {
    if (-not $KeepProcesses) {
        Stop-StartedProcesses
    }
}
