param([Parameter(Mandatory=$true)][string]$Directory, [switch]$Edit, [string]$Application = 'Word.Application')
$ErrorActionPreference = 'Stop'
$taskOutput = (Resolve-Path -LiteralPath $Directory).Path
$taskWord = New-Object -ComObject $Application
function Invoke-WordCall([scriptblock]$Call) {
  for ($attempt=0; $attempt -lt 30; $attempt++) {
    try { return (& $Call) } catch {
      if ($_.Exception.Message -notmatch 'rejected by callee|busy') { throw }
      Start-Sleep -Milliseconds 500
    }
  }
  throw 'Word remained busy after 15 seconds.'
}
Invoke-WordCall { $taskWord.Visible = $false }
Invoke-WordCall { $taskWord.DisplayAlerts = 0 }
$taskEvidence = @()
try {
  foreach ($taskFile in Get-ChildItem -LiteralPath $taskOutput -Filter '*.docx') {
    if ($taskFile.BaseName.EndsWith('-edited')) { continue }
    $taskDoc = Invoke-WordCall { $taskWord.Documents.Open($taskFile.FullName, $false, $false) }
    try {
      $taskDoc.Repaginate()
      $taskPages = $taskDoc.ComputeStatistics(2)
      $taskDoc.ExportAsFixedFormat((Join-Path $taskOutput ($taskFile.BaseName + '.pdf')), 17)
      $taskEntry = @{ name=$taskFile.BaseName; application=$Application; version=$taskWord.Version; pages=$taskPages; tables=$taskDoc.Tables.Count; textEdit=$false; cellEdit=$false }
      if ($Edit) {
        $taskRange = $taskDoc.Content.Duplicate
        $taskFind = $taskRange.Find
        $taskFind.Text = '[A-Za-z]{3,}'
        $taskFind.MatchWildcards = $true
        if ($taskFind.Execute()) { $taskRange.Text = 'EDIT'; $taskEntry.textEdit=$true }
        if ($taskDoc.Tables.Count -gt 0) { $taskDoc.Tables.Item(1).Cell(1,1).Range.Text = 'CELL EDIT'; $taskEntry.cellEdit=$true }
        $taskDoc.SaveAs2((Join-Path $taskOutput ($taskFile.BaseName + '-edited.docx')), 16)
        $taskDoc.ExportAsFixedFormat((Join-Path $taskOutput ($taskFile.BaseName + '-edited.pdf')), 17)
        $taskEntry.editedPages = $taskDoc.ComputeStatistics(2)
      }
      $taskEvidence += $taskEntry
      Write-Output "$($taskFile.BaseName): $taskPages pages, $($taskEntry.tables) tables"
    } finally { $taskDoc.Close(0) }
  }
} finally { $taskWord.Quit() }
$taskEvidence | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskOutput 'word-render.json') -Encoding utf8
