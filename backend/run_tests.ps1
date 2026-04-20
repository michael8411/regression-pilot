#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Run the backend test suite using the project's virtual environment.

.DESCRIPTION
    Resolves the venv Python at backend/.venv/Scripts/python.exe, changes to
    the backend/ directory, and invokes pytest with the configuration in
    pytest.ini. Forwards any extra arguments straight to pytest.

.EXAMPLE
    # Run every test
    .\run_tests.ps1

.EXAMPLE
    # Run just the utils tests, verbose
    .\run_tests.ps1 tests/utils -v

.EXAMPLE
    # Run a single test file
    .\run_tests.ps1 tests/utils/test_secret_scanner.py

.EXAMPLE
    # Run a single test by name pattern
    .\run_tests.ps1 -k "redact"
#>

param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PytestArgs
)

$ErrorActionPreference = "Stop"

$backendDir = $PSScriptRoot
$venvPython = Join-Path $backendDir ".venv/Scripts/python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "Virtual environment not found at $venvPython" -ForegroundColor Red
    Write-Host "Create it with:" -ForegroundColor Yellow
    Write-Host "    python -m venv .venv" -ForegroundColor Yellow
    Write-Host "    .venv\Scripts\pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}

Push-Location $backendDir
try {
    & $venvPython -m pytest @PytestArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
