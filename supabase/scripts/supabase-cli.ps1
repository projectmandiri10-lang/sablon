param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$SupabaseArgs
)

$ErrorActionPreference = 'Stop'

function Get-RepoRoot {
  return [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
}

function Read-DotEnv {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) {
      continue
    }

    $separatorIndex = $trimmed.IndexOf('=')
    if ($separatorIndex -lt 1) {
      continue
    }

    $key = $trimmed.Substring(0, $separatorIndex).Trim()
    $value = $trimmed.Substring($separatorIndex + 1).Trim()

    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $values[$key] = $value
  }

  return $values
}

function Require-EnvValue {
  param(
    [hashtable]$Values,
    [string]$Key
  )

  $value = [string]$Values[$Key]
  if (-not $value) {
    throw "Nilai $Key tidak ditemukan di .env repo."
  }

  return $value
}

function Build-SupabaseArgs {
  param(
    [string[]]$CliArgs,
    [string]$ProjectRef
  )

  if (-not $CliArgs -or $CliArgs.Count -eq 0) {
    return @('projects', 'list')
  }

  $resolved = [System.Collections.Generic.List[string]]::new()
  foreach ($arg in $CliArgs) {
    $resolved.Add($arg)
  }

  if ($resolved.Count -gt 0 -and $resolved[0] -eq 'link' -and -not ($resolved -contains '--project-ref')) {
    $resolved.Add('--project-ref')
    $resolved.Add($ProjectRef)
  }

  return $resolved.ToArray()
}

$repoRoot = Get-RepoRoot
$envPath = Join-Path $repoRoot '.env'

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "File .env tidak ditemukan di $repoRoot."
}

$envValues = Read-DotEnv -Path $envPath
$projectRef = Require-EnvValue -Values $envValues -Key 'SUPABASE_PROJECT_REF'
$accessToken = Require-EnvValue -Values $envValues -Key 'SUPABASE_ACCESS_TOKEN'
$rawArgs = @()
if ($SupabaseArgs) {
  $rawArgs += $SupabaseArgs
}
if ($args) {
  $rawArgs += $args
}

$env:SUPABASE_ACCESS_TOKEN = $accessToken
$resolvedArgs = Build-SupabaseArgs -CliArgs $rawArgs -ProjectRef $projectRef

Write-Host "Supabase helper memakai project_ref $projectRef" -ForegroundColor Cyan
Write-Host "Menjalankan: npx supabase $($resolvedArgs -join ' ')" -ForegroundColor DarkGray

& npx supabase @resolvedArgs
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
  exit $exitCode
}
