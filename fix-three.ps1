# fix-three.ps1
# Convert HTML files for Android WebView: drop ES modules, switch to UMD Three.js
# Works in PowerShell 5.1 and 7.x

$root = $PSScriptRoot
$htmlFiles = Get-ChildItem -Path $root -Filter *.html -Recurse |
    Where-Object { $_.FullName -notmatch '\\backup\\' -and $_.Name -notlike '*.bak*' }

if (-not $htmlFiles) { Write-Host 'No HTML files found'; exit }

$scriptTag = @'
<script src="/android_asset/physics/three/build/three.min.js"></script>
<script src="/android_asset/physics/three/examples/js/controls/OrbitControls.js"></script>
<script src="/android_asset/physics/three/examples/js/renderers/CSS2DRenderer.js"></script>
'@

$totalFixed   = 0
$totalSkipped = 0
$totalFailed  = 0

foreach ($file in $htmlFiles) {
    $path     = $file.FullName
    $original = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    $content  = $original
    $changed  = $false
    $notes    = @()

    # --- 0. Broken backtick-n between scripts ---
    if ($content -match '`n') {
        $content = $content -replace '`n', "`r`n"
        $changed = $true
        $notes += 'fix backtick-n'
    }

    # --- 1. importmap -> three UMD scripts ---
    if ($content -match '(?s)<script\s+type="importmap"\s*>.*?</script>') {
        $content = $content -replace '(?s)<script\s+type="importmap"\s*>.*?</script>', $scriptTag
        $changed = $true
        $notes += 'importmap -> UMD scripts'
    }

    # --- 2. <script type="module"> -> <script> ---
    if ($content -match '<script\s+type="module"\s*>') {
        $content = $content -replace '<script\s+type="module"\s*>', '<script>'
        $changed = $true
        $notes += 'module -> script'
    }

    # --- 3. Remove import lines (single quotes + \x7B/\x7D escapes for PS 5.1) ---
    $before = $content
    $content = $content -replace '(?m)^\s*import\s+\*\s+as\s+THREE\s+from\s+[''"]three[''"];\s*\r?\n', ''
    $content = $content -replace '(?m)^\s*import\s+\x7B[^\x7D]*\x7D\s+from\s+[''"]three[^''"]*[''"];\s*\r?\n', ''
    $content = $content -replace '(?m)^\s*import\s+[^;]*?\s+from\s+[''"]three[^''"]*[''"];\s*\r?\n', ''
    if ($content -ne $before) {
        $changed = $true
        $notes += 'removed import'
    }

    # --- 4. Constructor replacements (only outside THREE.* already) ---
    $before = $content
    $content = $content -replace '(?<![\w.])new\s+CSS2DRenderer\s*\(', 'new THREE.CSS2DRenderer('
    $content = $content -replace '(?<![\w.])new\s+CSS2DObject\s*\(',   'new THREE.CSS2DObject('
    $content = $content -replace '(?<![\w.])new\s+OrbitControls\s*\(', 'new THREE.OrbitControls('
    if ($content -ne $before) {
        $changed = $true
        $notes += 'constructors -> THREE.*'
    }

    if (-not $changed) {
        $totalSkipped++
        continue
    }

    # --- backup (do not overwrite existing .bak) ---
    $backup = "$path.bak"
    if (-not (Test-Path $backup)) {
        [System.IO.File]::WriteAllText($backup, $original, (New-Object System.Text.UTF8Encoding $false))
    }

    # --- write (UTF-8, no BOM) ---
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)

    # --- verify ---
    $check = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    $problems = @()
    if ($check -match '<script\s+type="module"\s*>')   { $problems += 'type=module still present' }
    if ($check -match "from\s+['`"]three")             { $problems += 'import from three still present' }
    if ($check -match '`n')                            { $problems += 'backtick-n still present' }
    if ($check -match '<script\s+type="importmap"\s*>'){ $problems += 'importmap still present' }

    if ($problems.Count -gt 0) {
        # rollback
        [System.IO.File]::WriteAllText($path, $original, $utf8NoBom)
        Write-Host ('[FAIL] {0}  ->  {1}' -f $file.Name, ($problems -join '; ')) -ForegroundColor Red
        $totalFailed++
    } else {
        Write-Host ('[OK]   {0}  ->  {1}' -f $file.Name, ($notes -join ', ')) -ForegroundColor Green
        $totalFixed++
    }
}

Write-Host ''
Write-Host ('Total: fixed {0}, skipped {1}, rolled back {2}' -f $totalFixed, $totalSkipped, $totalFailed) -ForegroundColor Cyan