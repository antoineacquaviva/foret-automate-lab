<#
.SYNOPSIS
    Version v2 robuste — Automatise l'initialisation Git/GitHub, la résolution automatique de la clé SSH
    et de l'utilisateur OCI (ubuntu vs opc), le transfert vers la VM Oracle (141.145.218.127),
    et la synchronisation des résultats.

.EXAMPLE
    .\scripts\deploy_workflow-v2.ps1 -Action init `
        -GitRepoUrl "https://github.com/antoineacquaviva/foret-automate-lab.git" `
        -SshKeyPath "oracle-vm"
#>
param(
    [ValidateSet("init", "sync", "run", "pull", "status")]
    [string]$Action = "init",

    [string]$VmHost = "141.145.218.127",
    [string]$VmUser = "auto",
    [string]$SshKeyPath = "oracle-vm",
    [string]$RemoteDir = "~/foret-automate-lab",
    [string]$GitRepoUrl = "https://github.com/antoineacquaviva/foret-automate-lab.git",
    [ValidateSet("quick", "full")]
    [string]$CampaignMode = "quick",
    [int]$Workers = 14
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# ------------------------------------------------------------------------------
# 1. Résolution intelligente du chemin de la clé SSH (ou alias dans ~/.ssh/config)
# ------------------------------------------------------------------------------
function Resolve-SshConnection {
    param([string]$InputKey, [string]$HostIp, [string]$RequestedUser)

    $ResolvedKey = $null
    $Candidates = @(
        $InputKey,
        (Join-Path $ProjectRoot $InputKey),
        (Join-Path "$HOME\.ssh" $InputKey),
        (Join-Path "$HOME\.ssh" "$InputKey.key"),
        (Join-Path "$HOME\.ssh" "$InputKey.pem"),
        (Join-Path "$HOME\Downloads" $InputKey),
        (Join-Path "$HOME\Downloads" "$InputKey.key")
    )
    foreach ($c in $Candidates) {
        if ($c -and (Test-Path $c -PathType Leaf)) {
            $ResolvedKey = (Resolve-Path $c).Path
            break
        }
    }

    # Vérifier si $InputKey est en réalité un Host défini dans ~/.ssh/config
    $SshConfigPath = "$HOME\.ssh\config"
    $IsSshAlias = $false
    if ((-not $ResolvedKey) -and (Test-Path $SshConfigPath)) {
        $cfgText = Get-Content $SshConfigPath -Raw
        if ($cfgText -match "(?m)^\s*Host\s+.*\b$([regex]::Escape($InputKey))\b") {
            $IsSshAlias = $true
        }
    }

    if ($IsSshAlias) {
        Write-Host "[SSH] Alias '$InputKey' détecté dans ~/.ssh/config." -ForegroundColor Green
        return @{
            Target = $InputKey
            SshOpts = @("-o", "StrictHostKeyChecking=accept-new")
        }
    }

    if (-not $ResolvedKey) {
        Write-Host "[ERREUR SSH] Impossible de trouver le fichier de clé privée '$InputKey' !" -ForegroundColor Red
        Write-Host "Chemins testés : dossier courant, $HOME\.ssh\, $HOME\Downloads\." -ForegroundColor Yellow
        if (Test-Path "$HOME\.ssh") {
            Write-Host "Fichiers présents dans $HOME\.ssh :" -ForegroundColor Cyan
            Get-ChildItem "$HOME\.ssh" | Select-Object -ExpandProperty Name | ForEach-Object { Write-Host "  - $_" }
        }
        throw "Veuillez passer le chemin exact de votre clé privée OCI via -SshKeyPath (ex: -SshKeyPath `"$HOME\.ssh\ma_cle.key`")"
    }

    Write-Host "[SSH] Clé privée trouvée : $ResolvedKey" -ForegroundColor Green
    $Opts = @("-i", $ResolvedKey, "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10")

    # Auto-détection de l'utilisateur OCI (ubuntu vs opc)
    $UsersToTry = if ($RequestedUser -eq "auto") { @("ubuntu", "opc") } else { @($RequestedUser, "ubuntu", "opc") | Select-Object -Unique }
    foreach ($u in $UsersToTry) {
        Write-Host "[SSH] Test de connexion avec l'utilisateur '$u@$HostIp'..." -ForegroundColor DarkGray
        & ssh @Opts -o BatchMode=yes "$u@$HostIp" "exit 0" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[SSH] Connexion validée sur $u@$HostIp !" -ForegroundColor Green
            return @{
                Target = "$u@$HostIp"
                SshOpts = $Opts
            }
        }
    }

    throw "Échec d'authentification SSH sur $HostIp avec la clé '$ResolvedKey' (utilisateurs testés : $($UsersToTry -join ', ')). Vérifiez que c'est bien la clé associée à la VM dans la console Oracle."
}

$Conn = Resolve-SshConnection -InputKey $SshKeyPath -HostIp $VmHost -RequestedUser $VmUser
$Target = $Conn.Target
$SshOpts = $Conn.SshOpts

function Invoke-VmCommand([string]$RemoteCmd) {
    Write-Host "[SSH -> $Target] $RemoteCmd" -ForegroundColor Cyan
    & ssh @SshOpts $Target $RemoteCmd
    if ($LASTEXITCODE -ne 0) {
        throw "La commande distante a échoué (code $LASTEXITCODE) : $RemoteCmd"
    }
}

switch ($Action) {
    "init" {
        Write-Host "=== 1. INITIALISATION GIT LOCALE ===" -ForegroundColor Green
        git config core.autocrlf false
        if (-not (Test-Path ".git")) {
            git init
            git branch -M main
        }

        # Forcer les fins de ligne LF sur les scripts .sh avant commit
        Get-ChildItem -Path "$ProjectRoot\scripts\*.sh" | ForEach-Object {
            $content = [System.IO.File]::ReadAllText($_.FullName) -replace "`r`n", "`n"
            [System.IO.File]::WriteAllText($_.FullName, $content)
        }

        git add .
        $status = git status --porcelain
        if ($status) {
            git commit -m "Initialisation du banc d'essai foret-automate-lab"
        }

        if ($GitRepoUrl -ne "") {
            $remotes = git remote
            if ($remotes -notcontains "origin") {
                git remote add origin $GitRepoUrl
            } else {
                git remote set-url origin $GitRepoUrl
            }
            Write-Host "Envoi vers GitHub ($GitRepoUrl)..." -ForegroundColor Green
            try {
                git push -u origin main
            } catch {
                Write-Host "[AVERTISSEMENT GIT] Le push vers '$GitRepoUrl' a échoué." -ForegroundColor Yellow
                if ($GitRepoUrl -like "git@github.com:*") {
                    $HttpsUrl = $GitRepoUrl -replace "^git@github\.com:", "https://github.com/"
                    Write-Host "Bascule automatique vers HTTPS ($HttpsUrl) via Git Credential Manager..." -ForegroundColor Cyan
                    git remote set-url origin $HttpsUrl
                    git push -u origin main
                }
            }
        }

        Write-Host "=== 2. TRANSFERT & DÉPLOIEMENT SUR LA VM ($Target) ===" -ForegroundColor Green
        $TmpTar = "$env:TEMP\foret-automate-deploy.tar.gz"
        if (Test-Path $TmpTar) { Remove-Item $TmpTar -Force }
        tar -czf $TmpTar --exclude=".venv" --exclude="__pycache__" --exclude="logs" --exclude="results" .

        Invoke-VmCommand "mkdir -p $RemoteDir"
        Write-Host "[SCP -> $Target] Transfert de l'archive vers $RemoteDir..." -ForegroundColor Cyan
        & scp @SshOpts $TmpTar "${Target}:${RemoteDir}/deploy.tar.gz"
        if ($LASTEXITCODE -ne 0) {
            throw "Le transfert SCP vers $Target a échoué."
        }
        Remove-Item $TmpTar -Force

        $RemoteSetupCmd = "cd $RemoteDir && tar -xzf deploy.tar.gz && rm deploy.tar.gz && ./scripts/setup_vm.sh"
        Invoke-VmCommand $RemoteSetupCmd
    }

    "sync" {
        Write-Host "=== SYNCHRONISATION PC -> GITHUB -> VM ===" -ForegroundColor Green
        git add .
        $status = git status --porcelain
        if ($status) {
            $msg = "Mise à jour paramètres/code ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))"
            git commit -m $msg
        }
        git push origin main
        Invoke-VmCommand "cd $RemoteDir && git pull --rebase origin main"
    }

    "run" {
        Write-Host "=== LANCEMENT DE LA CAMPAGNE '$CampaignMode' SUR LA VM ($Workers workers) ===" -ForegroundColor Green
        Invoke-VmCommand "cd $RemoteDir && ./scripts/run_oci_campaign.sh $CampaignMode $Workers true"
    }

    "status" {
        Write-Host "=== ÉTAT DE LA CAMPAGNE SUR LA VM ===" -ForegroundColor Green
        Invoke-VmCommand "ps aux | grep '[s]rc.runner' || echo 'Aucun calcul en cours.'; ls -dt $RemoteDir/logs/*.log 2>/dev/null | head -n 1 | xargs tail -n 15 2>/dev/null || true"
    }

    "pull" {
        Write-Host "=== RAPATRIEMENT DES RÉSULTATS DE CAMPAGNE ===" -ForegroundColor Green
        New-Item -ItemType Directory -Force -Path "$ProjectRoot\results" | Out-Null
        Write-Host "[SCP <- $Target] Téléchargement des rapports Markdown et CSV..." -ForegroundColor Cyan
        & scp @SshOpts -r "${Target}:${RemoteDir}/results/*" "$ProjectRoot\results\"
        Write-Host "[OK] Résultats disponibles dans $ProjectRoot\results\" -ForegroundColor Green
    }
}
