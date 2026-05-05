<#
.SYNOPSIS
Windows wrapper for the cross-platform Node infra manager.
#>
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$nodeScript = Join-Path $PSScriptRoot 'manage-infra.mjs'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is required to run $nodeScript"
}

& node $nodeScript @Args
exit $LASTEXITCODE