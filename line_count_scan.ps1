$excludePattern = '\\node_modules\\'
$top = Get-ChildItem -Recurse -File | Where-Object { $_.FullName -notmatch $excludePattern } | ForEach-Object {
    $lines = 0
    try {
        $lines = (Get-Content -ErrorAction Stop $_.FullName | Measure-Object -Line).Lines
    } catch {
    }
    [PSCustomObject]@{ FullName = $_.FullName; Lines = $lines }
} | Sort-Object Lines -Descending | Select-Object -First 1
if ($top) {
    "$($top.FullName)`n$($top.Lines)" | Set-Content -Path largest_file_line_count.txt -Encoding utf8
}
