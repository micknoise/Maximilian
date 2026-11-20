# Build and run every verification case.
#
#   .\run.ps1              run all cases
#   .\run.ps1 sine_440     run one
#
# No audio device, no audio dependencies: the harness links the core library only,
# and the FFT case adds maxiFFT.cpp + fft.cpp.
#
# Set CXX if your compiler is not on PATH, e.g.  $env:CXX = "C:\MinGW\bin\g++.exe"

$ErrorActionPreference = "Continue"

$here  = $PSScriptRoot
$root  = Split-Path (Split-Path $here -Parent) -Parent
$src   = Join-Path $root "src"
$libs  = Join-Path $root "src\libs"
$build = Join-Path $here "build"

$Cxx = if ($env:CXX) { $env:CXX } else { "g++" }
$Flags = @("-std=c++17", "-O2", "-Wall")

$only = $args[0]

if (-not (Get-Command $Cxx -ErrorAction SilentlyContinue)) {
    Write-Host "no compiler found: '$Cxx' is not on PATH."
    Write-Host "Set it explicitly, e.g.  `$env:CXX = 'C:\MinGW\bin\g++.exe'"
    exit 2
}

New-Item -ItemType Directory -Force -Path $build | Out-Null

$failed = 0
$ran = 0

function Invoke-Case {
    param([string]$Name, [string[]]$Extra = @())

    if ($only -and $only -ne $Name) { return }

    $exe = Join-Path $build "$Name.exe"
    $err = Join-Path $build "$Name.err"

    $sources = @(
        (Join-Path $here "harness.cpp"),
        (Join-Path $here "cases\$Name.cpp"),
        (Join-Path $src  "maximilian.cpp")
    ) + $Extra

    $compileArgs = $Flags + @("-I", $src, "-I", $libs, "-I", $here, "-o", $exe) + $sources
    & $Cxx @compileArgs 2>&1 | Out-File -FilePath $err -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        Write-Host ("BUILD FAILED  {0}" -f $Name)
        Get-Content $err | Select-Object -First 20 | ForEach-Object { "    $_" }
        $script:failed++
        return
    }

    $script:ran++
    $out = Join-Path $build "$Name.out"
    & $exe --seconds 1.0 --rate 44100 --channels 2 2>&1 | Out-File -FilePath $out -Encoding utf8
    $code = $LASTEXITCODE

    $first = (Get-Content $out | Where-Object { $_ -match '^frames=' } | Select-Object -First 1)
    "{0,-16}  {1}" -f $Name, $first
    if ($code -eq 0) {
        "                PASS"
    } else {
        Get-Content $out | Where-Object { $_ -match '^  BAD|^check:|^expected|^frames analysed' } |
            ForEach-Object { "  $_" }
        "                FAIL"
        $script:failed++
    }
}

Invoke-Case -Name "sine_440"
Invoke-Case -Name "adsr_gate"
Invoke-Case -Name "filtered_noise"
Invoke-Case -Name "fft_pitch" -Extra @(
    (Join-Path $libs "maxiFFT.cpp"),
    (Join-Path $libs "fft.cpp")
)

Write-Host ""
if ($failed -eq 0) {
    Write-Host "all $ran cases passed"
    exit 0
}
Write-Host "$failed case(s) failed (build output in $build)"
exit 1
