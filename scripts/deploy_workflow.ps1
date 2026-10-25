<#
.SYNOPSIS
    Automatise l'initialisation Git/GitHub, le transfert vers la VM Oracle (141.145.218.127),
    le déploiement de l'environnement Python/Numba et la synchronisation des résultats.

.PARAMETER Action
    - "init"   : Initialise Git en local, pousse sur GitHub, transfère et installe tout sur la VM.
    - "sync"   : Envoie les dernières modifications locales sur GitHub et met à jour la VM (git pull).
    - "run"    : Lance une campagne sur la VM à distance ("quick" ou "full").
    - "pull"   : Récupère les derniers résultats (rapports .md et .csv) depuis GitHub / la VM.

.EXAMPLE
    .\scripts\deploy_workflow.ps1 -Action init -GitRepoUrl "git@github.com:TON_USER/foret-automate-lab.git"
    .\scripts\deploy_workflow.ps1 -Action run -CampaignMode "quick"
    .\scripts\deploy_workflow.ps1 -Action pull
#>
param(
    [ValidateSet("init", "sync", "run", "pull", "status")]
    [string]$Action = "init",

    [string]$VmHost = "141.145.218.127",
    [string]$VmUser = "ubuntu",
    [string]$SshKeyPath = "$HOME\.ssh\id_rsa",
    [string]$RemoteDir = "~/foret-automate-lab",
    [string]$GitRepoUrl = "",
    [ValidateSet("quick", "full")]
    [string]$CampaignMode = "quick",
    [int]$Workers = 14
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# Construction des options SSH/SCP
$SshOpts = @("-o", "StrictHostKeyChecking=accept-new")
if (Test-Path $SshKeyPath) {
    $SshOpts += @("-i", $SshKeyPath)
}
$Target = "$VmUser@$VmHost"

function Invoke-VmCommand([string]$RemoteCmd) {
    Write-Host "[SSH -> $Target] $RemoteCmd" -ForegroundColor Cyan
    & ssh @SshOpts $Target $RemoteCmd
}

switch ($Action) {
    "init" {
        Write-Host "=== 1. INITIALISATION GIT LOCALE ===" -ForegroundColor Green
        if (-not (Test-Path ".git")) {
            git init
            git branch -M main
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
            git push -u origin main
        } elseif (Get-Command gh -ErrorAction SilentlyContinue) {
            Write-Host "Création du dépôt privé sur GitHub via GitHub CLI (gh)..." -ForegroundColor Green
            gh repo create foret-automate-lab --private --source=. --remote=origin --push
            $GitRepoUrl = (git remote get-url origin).Trim()
        } else {
            Write-Host "[INFO] Aucun GitRepoUrl fourni : déploiement direct par archive SCP vers la VM." -ForegroundColor Yellow
        }

        Write-Host "=== 2. TRANSFERT & DÉPLOIEMENT SUR LA VM ($Target) ===" -ForegroundColor Green
        # Conversion des fins de ligne CRLF -> LF sur les scripts shell avant envoi
        Get-ChildItem -Path "$ProjectRoot\scripts\*.sh" | ForEach-Object {
            $content = [System.IO.File]::ReadAllText($_.FullName) -replace "`r`n", "`n"
            [System.IO.File]::WriteAllText($_.FullName, $content)
        }

        # Création d'une archive temporaire légère (sans .venv ni checkpoints)
        $TmpTar = "$env:TEMP\foret-automate-deploy.tar.gz"
        if (Test-Path $TmpTar) { Remove-Item $TmpTar -Force }
        tar -czf $TmpTar --exclude=".venv" --exclude="__pycache__" --exclude="logs" --exclude="results" .

        Invoke-VmCommand "mkdir -p $RemoteDir"
        Write-Host "[SCP -> $Target] Transfert de l'archive vers $RemoteDir..." -ForegroundColor Cyan
        & scp @SshOpts $TmpTar "${Target}:${RemoteDir}/deploy.tar.gz"
        Remove-Item $TmpTar -Force

        # Extraction, liaison Git et installation sur la VM
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
        $remotes = git remote
        if ($remotes -contains "origin") {
            git push origin main
            Invoke-VmCommand "cd $RemoteDir && git pull --rebase origin main"
        } else {
            Write-Host "Pas de remote Git configuré, synchronisation directe via SCP..." -ForegroundColor Yellow
            & $PSCommandPath -Action init -VmHost $VmHost -VmUser $VmUser -SshKeyPath $SshKeyPath
        }
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
        $remotes = git remote
        if ($remotes -contains "origin") {
            git pull origin main
        }
        New-Item -ItemType Directory -Force -Path "$ProjectRoot\results" | Out-Null
        Write-Host "[SCP <- $Target] Téléchargement des rapports Markdown et CSV..." -ForegroundColor Cyan
        & scp @SshOpts -r "${Target}:${RemoteDir}/results/*" "$ProjectRoot\results\"
        Write-Host "[OK] Résultats disponibles dans $ProjectRoot\results\" -ForegroundColor Green
    }
}
