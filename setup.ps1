#!/usr/bin/env pwsh

# cp-detection Bootstrap Setup
#
# Installs the development toolchain and the project's dependencies.
# Works on a FRESH PC -- only prerequisites are PowerShell and winget.
# Safe to re-run (idempotent) -- skips anything already installed.
#
# Usage: pwsh ./setup.ps1 or powershell -ExecutionPolicy Bypass -File ./setup.ps1
# Note: run from PowerShell, NOT cmd.exe.
#
# ----------------------------------------------------------------------------------
# NO ADMINISTRATOR REQUIRED.
#
# Unlike the KollectApps NextGen setup, nothing here installs a Windows service or
# writes outside your user profile -- there is no database, no JDK pin, and no
# monitoring stack. A normal PowerShell window is enough.
#
# Everything is fetched from public sources (winget, npm, the Playwright CDN), so
# no VPN or office network is needed either.
# ----------------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'

function Test-Command($Name) {
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Refresh-Path {
    # Reload PATH from registry so newly installed tools are found in this session
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

function Install-Winget($PackageId, $DisplayName) {
    Write-Host "  [INSTALL] Installing $DisplayName via winget ($PackageId)..." -ForegroundColor Yellow
    $savedEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & winget install --id $PackageId --exact --silent `
        --accept-package-agreements --accept-source-agreements 2>$null | Out-Host
    $code = $LASTEXITCODE
    $ErrorActionPreference = $savedEAP
    Refresh-Path
    # winget returns 0 on fresh install, -1978335189 (0x8A15002B) when already installed -- both fine
    return ($code -eq 0 -or $code -eq -1978335189)
}

function Add-UserPath($Dir) {
    if (-not (Test-Path $Dir)) { return }
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    if (($userPath -split ';').Trim() -notcontains $Dir) {
        [System.Environment]::SetEnvironmentVariable("Path", "$userPath;$Dir", "User")
        Write-Host "  [INFO] Added $Dir to User PATH" -ForegroundColor Yellow
    }
    Refresh-Path
}

Write-Host ""
Write-Host "cp-detection Bootstrap Setup" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Clipboard-activity detector -- TanStack Start + shadcn/ui, built TDD." -ForegroundColor DarkGray
Write-Host "  No Administrator, no VPN, no database required." -ForegroundColor DarkGray
Write-Host ""

# ---------- 0. Prerequisites check ----------
Refresh-Path
$hasWinget = Test-Command "winget"
if (-not $hasWinget) {
    Write-Host "  [WARN] winget not found. Auto-install for Git/Node.js will be skipped." -ForegroundColor Yellow
    Write-Host "         Install App Installer from the Microsoft Store to enable winget." -ForegroundColor DarkGray
}

# ---- Basic CLI Tools ----------------------------------------
Write-Host ""
Write-Host "  Basic CLI Tools" -ForegroundColor Cyan

# ---------- 1. Git ----------
Refresh-Path
if (Test-Command "git") {
    Write-Host "  [OK] Git already installed: $(git --version)" -ForegroundColor Green
} elseif ($hasWinget) {
    if (Install-Winget "Git.Git" "Git") {
        Refresh-Path
        if (Test-Command "git") {
            Write-Host "  [OK] Git installed: $(git --version)" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] Git installed but not on PATH. Close and reopen PowerShell, then re-run." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "  [FAIL] Git install failed via winget" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  [FAIL] Git missing and winget unavailable. Install from https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}

# ---------- 2. Node.js (LTS) ----------
# Vite 8 / TanStack Start need a modern Node; the LTS line is what this project is built on.
Refresh-Path
if (Test-Command "node") {
    Write-Host "  [OK] Node.js already installed: $(node -v)" -ForegroundColor Green
} elseif ($hasWinget) {
    if (Install-Winget "OpenJS.NodeJS.LTS" "Node.js (LTS)") {
        Refresh-Path
        if (Test-Command "node") {
            Write-Host "  [OK] Node.js installed: $(node -v)" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] Node.js installed but not on PATH. Close and reopen PowerShell, then re-run." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "  [FAIL] Node.js install failed via winget" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  [FAIL] Node.js missing and winget unavailable. Install from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# ---------- 3. pnpm ----------
# The lockfile is pnpm's -- npm install would produce a different tree.
Refresh-Path
if (Test-Command "pnpm") {
    Write-Host "  [OK] pnpm already installed: $(pnpm -v)" -ForegroundColor Green
} else {
    Write-Host "  [INSTALL] Installing pnpm via npm..." -ForegroundColor Yellow
    $savedEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & npm install -g pnpm 2>&1 | Out-Host
    $ErrorActionPreference = $savedEAP
    Refresh-Path
    if (Test-Command "pnpm") {
        Write-Host "  [OK] pnpm installed: $(pnpm -v)" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] pnpm install failed -- check npm output above" -ForegroundColor Red
        exit 1
    }
}

# ---------- 4. Claude Code CLI ----------
Refresh-Path
if (Test-Command "claude") {
    $claudeVer = & claude --version 2>&1 | Select-Object -First 1
    Write-Host "  [OK] Claude Code already installed: $claudeVer" -ForegroundColor Green
} else {
    Write-Host "  [INSTALL] Installing Claude Code via npm..." -ForegroundColor Yellow
    $savedEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & npm install -g "@anthropic-ai/claude-code" 2>&1 | Out-Host
    $ErrorActionPreference = $savedEAP
    Refresh-Path
    if (Test-Command "claude") {
        $claudeVer = & claude --version 2>&1 | Select-Object -First 1
        Write-Host "  [OK] Claude Code installed: $claudeVer" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Claude Code install failed -- check npm output above" -ForegroundColor Yellow
    }
}

# ---- Dev Tools ----------------------------------------------
Write-Host ""
Write-Host "  Dev Tools" -ForegroundColor Cyan

# ---------- 5. uv ----------
# Only here because it is how the team installs `just` (rust-just), matching the
# KollectApps NextGen setup so both repos bootstrap the same way. Nothing in this
# project is written in Python.
Refresh-Path
if (Test-Command "uv") {
    $uvVer = & uv --version 2>&1 | Select-Object -First 1
    Write-Host "  [OK] uv already installed: $uvVer" -ForegroundColor Green
} else {
    Write-Host "  [INSTALL] Installing uv..." -ForegroundColor Yellow
    Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
    Refresh-Path
    if (-not (Test-Command "uv")) {
        Write-Host "  [FAIL] uv installed but not found on PATH. Close and reopen PowerShell, then re-run." -ForegroundColor Red
        exit 1
    }
    Write-Host "  [OK] uv installed: $(& uv --version 2>&1 | Select-Object -First 1)" -ForegroundColor Green
}

# Ensure uv's tool bin directory is on PATH (fresh installs may not have ~/.local/bin yet)
$uvToolBin = & uv tool dir --bin 2>&1 | Select-Object -First 1
if ($uvToolBin) { Add-UserPath $uvToolBin }

# ---------- 6. just (task runner) ----------
Refresh-Path
if (Test-Command "just") {
    $justVer = & just --version 2>&1 | Select-Object -First 1
    Write-Host "  [OK] just already installed: $justVer" -ForegroundColor Green
} else {
    Write-Host "  [INSTALL] Installing just..." -ForegroundColor Yellow
    $savedEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & uv tool install rust-just 2>&1 | Out-Null
    $ErrorActionPreference = $savedEAP
    Refresh-Path
    if (Test-Command "just") {
        $justVer = & just --version 2>&1 | Select-Object -First 1
        Write-Host "  [OK] just installed: $justVer" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] just installed but not found on PATH" -ForegroundColor Red
        exit 1
    }
}

# ---- Project ------------------------------------------------
Write-Host ""
Write-Host "  Project" -ForegroundColor Cyan

Push-Location $PSScriptRoot
try {
    # ---------- 7. Dependencies ----------
    Write-Host "  [INSTALL] Installing dependencies (pnpm install)..." -ForegroundColor Yellow
    $savedEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & pnpm install 2>&1 | Out-Host
    $pnpmCode = $LASTEXITCODE
    $ErrorActionPreference = $savedEAP
    if ($pnpmCode -eq 0 -and (Test-Path (Join-Path $PSScriptRoot "node_modules"))) {
        Write-Host "  [OK] Dependencies installed" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] pnpm install failed -- see output above" -ForegroundColor Red
    }

    # ---------- 8. Playwright Chromium ----------
    # Chromium ONLY, deliberately: clipboard read/write permissions cannot be granted
    # in Firefox or WebKit, and granting them is the entire point of the E2E suite.
    # Downloading the other engines would just be ~400 MB that no spec can use.
    $pwCache = Join-Path $env:LOCALAPPDATA "ms-playwright"
    $hasChromium = (Test-Path $pwCache) -and
                   (Get-ChildItem $pwCache -Directory -Filter "chromium-*" -ErrorAction SilentlyContinue)
    if ($hasChromium) {
        Write-Host "  [OK] Playwright Chromium already present" -ForegroundColor Green
    } else {
        Write-Host "  [INSTALL] Downloading Playwright Chromium (~300 MB)..." -ForegroundColor Yellow
        $savedEAP = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & pnpm exec playwright install chromium 2>&1 | Out-Host
        $ErrorActionPreference = $savedEAP
        if (Get-ChildItem $pwCache -Directory -Filter "chromium-*" -ErrorAction SilentlyContinue) {
            Write-Host "  [OK] Playwright Chromium installed" -ForegroundColor Green
        } else {
            Write-Host "  [WARN] Chromium download failed -- 'just e2e' will not run until it succeeds" -ForegroundColor Yellow
        }
    }
} finally {
    Pop-Location
}

# ---- MCP Config ---------------------------------------------
Write-Host ""
Write-Host "  MCP Config" -ForegroundColor Cyan
# .mcp.json is COMMITTED in this repo (unlike KollectApps NextGen, where it is
# gitignored and seeded from a stub) -- none of these four servers carries a
# secret or a machine-specific path, so there is nothing to keep per-developer.
$mcpFile = Join-Path $PSScriptRoot ".mcp.json"
$expectedServers = @('playwright', 'shadcn', 'context7', 'chrome-devtools')
if (Test-Path $mcpFile) {
    try {
        $mcpJson = Get-Content $mcpFile -Raw | ConvertFrom-Json
        $present = $mcpJson.mcpServers.PSObject.Properties.Name
        foreach ($srv in $expectedServers) {
            if ($present -contains $srv) {
                Write-Host "  [OK] $srv MCP configured" -ForegroundColor Green
            } else {
                Write-Host "  [WARN] $srv MCP missing from .mcp.json" -ForegroundColor Yellow
            }
        }
        Write-Host "  [INFO] Restart Claude Code and run /mcp to connect them." -ForegroundColor DarkGray
    } catch {
        Write-Host "  [WARN] .mcp.json is not valid JSON ($_)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [WARN] .mcp.json missing -- MCP servers unavailable in Claude Code" -ForegroundColor Yellow
}

# ---------- Final verification ----------
Refresh-Path
Write-Host ""
Write-Host "Verifying installations..." -ForegroundColor Cyan
$missing = @()

Write-Host "  Basic CLI Tools" -ForegroundColor DarkCyan
foreach ($tool in @('git','node','npm','pnpm','claude')) {
    if (Test-Command $tool) {
        Write-Host "    [OK] $tool" -ForegroundColor Green
    } else {
        Write-Host "    [MISSING] $tool" -ForegroundColor Red
        $missing += $tool
    }
}

Write-Host "  Dev Tools" -ForegroundColor DarkCyan
foreach ($tool in @('uv','just')) {
    if (Test-Command $tool) {
        Write-Host "    [OK] $tool" -ForegroundColor Green
    } else {
        Write-Host "    [MISSING] $tool" -ForegroundColor Red
        $missing += $tool
    }
}

Write-Host "  Project" -ForegroundColor DarkCyan
if (Test-Path (Join-Path $PSScriptRoot "node_modules")) {
    Write-Host "    [OK] node_modules" -ForegroundColor Green
} else {
    Write-Host "    [MISSING] node_modules" -ForegroundColor Red
    $missing += "node_modules"
}
$pwCacheCheck = Join-Path $env:LOCALAPPDATA "ms-playwright"
if ((Test-Path $pwCacheCheck) -and (Get-ChildItem $pwCacheCheck -Directory -Filter "chromium-*" -ErrorAction SilentlyContinue)) {
    Write-Host "    [OK] Playwright Chromium" -ForegroundColor Green
} else {
    Write-Host "    [MISSING] Playwright Chromium" -ForegroundColor Red
    $missing += "Playwright Chromium"
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "  [WARN] Some tools not found: $($missing -join ', ')" -ForegroundColor Yellow
    Write-Host "         Close and reopen PowerShell then re-run setup.ps1." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""

# ---------- Next steps ----------
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Start the app:" -ForegroundColor Gray
Write-Host "       just dev              # http://localhost:3000" -ForegroundColor DarkGray
Write-Host "  2. Run the tests (both loops):" -ForegroundColor Gray
Write-Host "       just test             # vitest -- unit + jsdom" -ForegroundColor DarkGray
Write-Host "       just e2e              # playwright -- real clipboard, real keystrokes" -ForegroundColor DarkGray
Write-Host "       just verify           # the full gate before pushing" -ForegroundColor DarkGray
Write-Host "  3. See every recipe:" -ForegroundColor Gray
Write-Host "       just --list" -ForegroundColor DarkGray
Write-Host "  4. Restart Claude Code so the four MCP servers connect, then: /mcp" -ForegroundColor Gray
Write-Host ""
Write-Host "  Read CLAUDE.md before changing the detector -- the split between" -ForegroundColor DarkGray
Write-Host "  attribution.ts (pure) and clipboard-detector.ts (DOM) is what keeps" -ForegroundColor DarkGray
Write-Host "  the paste-provenance logic testable." -ForegroundColor DarkGray
Write-Host ""
