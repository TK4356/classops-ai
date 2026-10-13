$ErrorActionPreference = 'Stop'
$word = $null
$document = $null
$ownsWord = $false
$result = @{ok=$false;code='WORD_PAGES_FAILED';message='ไม่สามารถคำนวณหน้าด้วย Microsoft Word ได้'}
try {
  # Create a fresh automation application, never attach via GetActiveObject/GetObject.
  $word = New-Object -ComObject Word.Application
  # Fail closed before changing settings or opening files if this isn't a private instance.
  if ($word.UserControl -or $word.Visible -or $word.Documents.Count -ne 0) {
    $result = @{ok=$false;code='WORD_ISOLATION_FAILED';message='ไม่สามารถแยก Word สำหรับคำนวณได้ จึงหยุดโดยไม่แตะ Word ที่คุณเปิดอยู่'}
  } else {
    $ownsWord = $true
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $oldSecurity = $word.AutomationSecurity
    $word.AutomationSecurity = 3
    $document = $word.Documents.Open($env:CLASSOPS_WORD_INPUT,$false,$true,$false,[Type]::Missing,[Type]::Missing,$true,[Type]::Missing,[Type]::Missing,[Type]::Missing,[Type]::Missing,$false)
    $document.Repaginate()
    $total = [int]$document.ComputeStatistics(2)
    $items = [System.Collections.Generic.List[object]]::new()
    for ($i=1; $i -le $document.Paragraphs.Count; $i++) {
      $paragraph = $document.Paragraphs.Item($i)
      $range = $paragraph.Range
      $startRange = $document.Range($range.Start,$range.Start)
      $endPosition = [Math]::Max($range.Start,$range.End-1)
      $endRange = $document.Range($endPosition,$endPosition)
      $items.Add(@{text=[string]$range.Text;start=[int]$startRange.Information(3);end=[int]$endRange.Information(3)})
      foreach ($item in @($endRange,$startRange,$range,$paragraph)) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($item) }
    }
    $result = @{ok=$true;totalPages=$total;paragraphs=$items.ToArray()}
  }
} catch {
  # Do not expose paths or arbitrary Word error text to the renderer.
  $result = @{ok=$false;code='WORD_PAGES_FAILED';message='Word คำนวณหน้าไม่สำเร็จ ตรวจว่าติดตั้งและเปิดใช้งาน Word แล้ว หรือไฟล์ถูกป้องกัน/ไม่รองรับ'}
} finally {
  if ($document -and $ownsWord) { try { $document.Close(0) } catch {}; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document) }
  if ($word) {
    if ($ownsWord) { try { $word.AutomationSecurity=$oldSecurity; if (-not $word.UserControl -and $word.Documents.Count -eq 0) { $word.Quit(0) } } catch {} }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  }
}
[IO.File]::WriteAllText($env:CLASSOPS_WORD_OUTPUT,($result | ConvertTo-Json -Depth 6 -Compress),[Text.UTF8Encoding]::new($false))
