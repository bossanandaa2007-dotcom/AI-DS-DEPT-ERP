# Builds a zip of this project that is safe to send to someone else.
#
#   powershell -ExecutionPolicy Bypass -File scripts/package-handover.ps1
#
# The working folder holds three things that must never travel: the Supabase service-role key
# (bypasses all row-level security), the generated credential sheet for all 234 accounts, and
# the student roster. Each is excluded below and the result is scanned before the zip is kept.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format 'yyyy-MM-dd'
$name = "AI-DS-DEPT-ERP-handover-$stamp"
$staging = Join-Path $env:TEMP $name
$zip = Join-Path $root "$name.zip"

# Paths are matched against the path relative to the project root, using -like patterns.
$exclude = @(
  '.git\*', '.git',
  # A previous run leaves its zip in the project root; without this the next run packages it.
  '*.zip',
  'node_modules\*', 'node_modules',
  'frontend\node_modules\*', 'frontend\node_modules',
  'frontend\test-results\*', 'frontend\test-results',
  '__pycache__\*', '__pycache__',
  'backups\*', 'backups',
  # Secrets and personal data -----------------------------------------------
  'supabase\.env.ops',                    # service-role key
  'supabase\.temp\*', 'supabase\.temp',
  'supabase\pilot\out\*', 'supabase\pilot\out',                 # credentials.csv, DB backups
  'supabase\pilot\source-documents\*', 'supabase\pilot\source-documents',  # student roster
  'supabase\pilot\pilot-data.json'        # student roster
)

function Should-Skip([string]$relative) {
  foreach ($pattern in $exclude) { if ($relative -like $pattern) { return $true } }
  return $false
}

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

Write-Host "Staging from $root"
$copied = 0
Get-ChildItem -Path $root -Recurse -File -Force | ForEach-Object {
  $relative = $_.FullName.Substring($root.Length).TrimStart('\')
  if (Should-Skip $relative) { return }
  $target = Join-Path $staging $relative
  $parent = Split-Path -Parent $target
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  Copy-Item $_.FullName -Destination $target -Force
  $script:copied++
}
Write-Host "  copied $copied files"

# Fail loudly rather than shipping a secret. These patterns match key *material*, not the
# variable name: several files legitimately mention SUPABASE_SERVICE_ROLE_KEY in prose or as a
# property, and flagging those would make the check useless noise. The browser publishable key
# (`sb_publishable_...`) is deliberately not matched -- the application needs it to run.
$secretPatterns = @(
  'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.',   # a signed JWT, i.e. a real service-role key
  'sb_secret_[A-Za-z0-9_-]{8,}',                    # Supabase secret key format
  'SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^\s''"]{20,}'   # an assignment carrying a real value
)
Write-Host "`nScanning the staged copy..."
$leaks = @()
Get-ChildItem -Path $staging -Recurse -File | ForEach-Object {
  if ($_.Length -gt 2MB) { return }
  $text = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
  if ($null -eq $text) { return }
  foreach ($pattern in $secretPatterns) {
    if ($text -match $pattern) {
      $leaks += "$($_.FullName.Substring($staging.Length).TrimStart('\'))  (matched: $pattern)"
      break
    }
  }
}
foreach ($forbidden in @('supabase\.env.ops', 'supabase\pilot\pilot-data.json', 'supabase\pilot\out', 'supabase\pilot\source-documents')) {
  if (Test-Path (Join-Path $staging $forbidden)) { $leaks += "EXCLUDED PATH PRESENT: $forbidden" }
}
if ($leaks.Count -gt 0) {
  Write-Host "`nREFUSING TO PACKAGE - possible secret or personal data:" -ForegroundColor Red
  $leaks | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  Remove-Item $staging -Recurse -Force
  exit 1
}
Write-Host "  clean - no service-role key, no credential sheet, no student roster"

# Built entry by entry rather than with Compress-Archive: on Windows PowerShell that cmdlet
# writes backslash separators into the archive, which is outside the zip spec and unpacks on
# macOS and Linux as one flat directory of files literally named "frontend\src\App.tsx".
if (Test-Path $zip) { Remove-Item $zip -Force }
Add-Type -AssemblyName System.IO.Compression | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
$archive = [System.IO.Compression.ZipFile]::Open($zip, 'Create')
try {
  Get-ChildItem -Path $staging -Recurse -File | ForEach-Object {
    $entry = $_.FullName.Substring($staging.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $entry, 'Optimal') | Out-Null
  }
} finally {
  $archive.Dispose()
}
Remove-Item $staging -Recurse -Force

$size = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "`nCreated $zip ($size MB)"
