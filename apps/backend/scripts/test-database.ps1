$ErrorActionPreference = 'Stop'
$taskBackend = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskBin = if ($env:PG_BIN) { $env:PG_BIN } else { 'C:\Program Files\PostgreSQL\18\bin' }
$taskControl = Join-Path $taskBin 'pg_ctl.exe'
$taskInit = Join-Path $taskBin 'initdb.exe'
if (-not (Test-Path -LiteralPath $taskControl) -or -not (Test-Path -LiteralPath $taskInit)) {
  throw 'PostgreSQL binaries were not found. Set PG_BIN to the PostgreSQL bin directory.'
}
if (-not (Test-Path -LiteralPath (Join-Path $taskBackend 'dist\infrastructure\database\audited-transaction.js'))) {
  throw 'Run npm run build before npm run test:db.'
}
$taskData = [IO.Path]::GetFullPath((Join-Path $taskBackend '.work\postgres-tests'))
if (-not $taskData.StartsWith($taskBackend + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The test cluster must stay inside this backend workspace.'
}
if (Test-Path -LiteralPath (Join-Path $taskData 'postmaster.pid')) {
  throw 'The private test cluster already has a process marker. Finish that run before starting another.'
}
if (-not (Test-Path -LiteralPath (Join-Path $taskData 'PG_VERSION'))) {
  New-Item -ItemType Directory -Path $taskData -Force | Out-Null
  & $taskInit -D $taskData -U gabinete_test -A trust --no-locale --encoding=UTF8
  if ($LASTEXITCODE -ne 0) { throw 'Failed to initialize the private PostgreSQL test cluster.' }
}
$taskListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$taskListener.Start()
$taskPort = $taskListener.LocalEndpoint.Port
$taskListener.Stop()
$taskStarted = $false
$taskPreviousUrl = $env:TEST_DATABASE_URL
$taskCode = 1
Push-Location -LiteralPath $taskBackend
try {
  & $taskControl -D $taskData -l (Join-Path $taskData 'test-server.log') -o "-h 127.0.0.1 -p $taskPort" -w start
  if ($LASTEXITCODE -ne 0) { throw 'Failed to start the private PostgreSQL test cluster.' }
  $taskStarted = $true
  $env:TEST_DATABASE_URL = "postgresql://gabinete_test@127.0.0.1:$taskPort/postgres"
  & node --test --test-timeout=30000 '.\test\audited-transaction.postgres.test.mjs'
  $taskCode = $LASTEXITCODE
} finally {
  $env:TEST_DATABASE_URL = $taskPreviousUrl
  if ($taskStarted) {
    & $taskControl -D $taskData -m fast -w stop
    if ($LASTEXITCODE -ne 0) { $taskCode = 1 }
  }
  Pop-Location
}
exit $taskCode
