# prepboard desktop nudge: a pixel-art car tows a banner across the top of the screen, right to left.
# Uses only the WPF that ships with Windows. Clicking the car or banner opens the dashboard.
#
#   powershell -NoProfile -STA -ExecutionPolicy Bypass -File nudge-car.ps1 -Title "COMPLETE LEETCODE" -Subtitle "3 PROBLEMS LEFT TODAY"
param(
    [string]$Title = "COMPLETE LEETCODE",
    [string]$Subtitle = "",
    [double]$Seconds = 11,
    [string]$Url = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

function New-Map { New-Object System.Collections.Hashtable ([System.StringComparer]::Ordinal) }

function New-Brush([string]$Hex) {
    $brush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.ColorConverter]::ConvertFromString($Hex))
    $brush.Freeze()
    return $brush
}

# Draws a character grid as square pixels: one Path per colour, keyed by the grid character.
function New-PixelLayer([string[]]$Rows, $Palette, [double]$P) {
    $groups = New-Map
    for ($y = 0; $y -lt $Rows.Count; $y++) {
        $row = $Rows[$y]
        for ($x = 0; $x -lt $row.Length; $x++) {
            $c = [string]$row[$x]
            if (-not $Palette.ContainsKey($c)) { continue }
            if (-not $groups.ContainsKey($c)) { $groups[$c] = [System.Windows.Media.GeometryGroup]::new() }
            [void]$groups[$c].Children.Add([System.Windows.Media.RectangleGeometry]::new([System.Windows.Rect]::new($x * $P, $y * $P, $P, $P)))
        }
    }
    $canvas = [System.Windows.Controls.Canvas]::new()
    foreach ($key in @($groups.Keys)) {
        $path = [System.Windows.Shapes.Path]::new()
        $path.Data = $groups[$key]
        $path.Fill = $Palette[$key]
        [void]$canvas.Children.Add($path)
    }
    $max = 0
    foreach ($r in $Rows) { if ($r.Length -gt $max) { $max = $r.Length } }
    $canvas.Width = $max * $P
    $canvas.Height = $Rows.Count * $P
    [System.Windows.Media.RenderOptions]::SetEdgeMode($canvas, [System.Windows.Media.EdgeMode]::Aliased)
    return $canvas
}

# 5x7 pixel font.
$Font = @{
    "A" = " ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"
    "B" = "#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "
    "C" = " ### ", "#   #", "#    ", "#    ", "#    ", "#   #", " ### "
    "D" = "#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "
    "E" = "#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"
    "F" = "#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "
    "G" = " ### ", "#   #", "#    ", "# ###", "#   #", "#   #", " ####"
    "H" = "#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"
    "I" = "#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"
    "J" = "  ###", "   # ", "   # ", "   # ", "   # ", "#  # ", " ##  "
    "K" = "#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"
    "L" = "#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"
    "M" = "#   #", "## ##", "# # #", "# # #", "#   #", "#   #", "#   #"
    "N" = "#   #", "##  #", "# # #", "#  ##", "#   #", "#   #", "#   #"
    "O" = " ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "
    "P" = "#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "
    "Q" = " ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"
    "R" = "#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"
    "S" = " ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "
    "T" = "#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "
    "U" = "#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "
    "V" = "#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "
    "W" = "#   #", "#   #", "#   #", "# # #", "# # #", "## ##", "#   #"
    "X" = "#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"
    "Y" = "#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "
    "Z" = "#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"
    "0" = " ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "
    "1" = "  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "
    "2" = " ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"
    "3" = "#####", "   # ", "  #  ", "   # ", "    #", "#   #", " ### "
    "4" = "   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "
    "5" = "#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "
    "6" = "  ## ", " #   ", "#    ", "#### ", "#   #", "#   #", " ### "
    "7" = "#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "
    "8" = " ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "
    "9" = " ### ", "#   #", "#   #", " ####", "    #", "   # ", " ##  "
    " " = "     ", "     ", "     ", "     ", "     ", "     ", "     "
    "-" = "     ", "     ", "     ", "#####", "     ", "     ", "     "
    "!" = "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "     ", "  #  "
    "." = "     ", "     ", "     ", "     ", "     ", "     ", "  #  "
    ":" = "     ", "  #  ", "     ", "     ", "     ", "  #  ", "     "
    "/" = "    #", "    #", "   # ", "  #  ", " #   ", "#    ", "#    "
    "'" = "  #  ", "  #  ", "     ", "     ", "     ", "     ", "     "
}

# Turns text into pixel rows. $Colors gives one palette key per character (default "T").
function Get-TextRows([string]$Text, [string]$Colors, [switch]$Bold) {
    $rows = @("", "", "", "", "", "", "")
    for ($i = 0; $i -lt $Text.Length; $i++) {
        $glyph = $Font[[string]$Text[$i]]
        if (-not $glyph) { $glyph = $Font[" "] }
        $col = "T"
        if ($Colors -and $i -lt $Colors.Length) { $col = [string]$Colors[$i] }
        for ($r = 0; $r -lt 7; $r++) {
            $line = $glyph[$r].PadRight(5)
            if ($Bold) {
                # Thicken strokes: a pixel is on if it or its left neighbour is on (6 wide).
                $b = ""
                for ($x = 0; $x -lt 6; $x++) {
                    $on = ($x -lt 5 -and $line[$x] -eq "#") -or ($x -gt 0 -and $line[$x - 1] -eq "#")
                    if ($on) { $b += "#" } else { $b += " " }
                }
                $line = $b
            }
            $rows[$r] += $line.Replace("#", $col).Replace(" ", ".") + "."
        }
    }
    return $rows | ForEach-Object { $_.Substring(0, [Math]::Max(0, $_.Length - 1)) }
}

# Cloth banner with a pixel outline, notched corners, grommets and a shaded hem.
function Get-BannerRows([int]$W, [int]$H) {
    $rows = @()
    for ($y = 0; $y -lt $H; $y++) {
        $sb = New-Object System.Text.StringBuilder
        for ($x = 0; $x -lt $W; $x++) {
            $edgeX = ($x -eq 0 -or $x -eq $W - 1)
            $edgeY = ($y -eq 0 -or $y -eq $H - 1)
            if ($edgeX -and $edgeY) { [void]$sb.Append(".") }
            elseif ($edgeX -or $edgeY) { [void]$sb.Append("K") }
            elseif ($x -eq 1 -and ($y -eq 2 -or $y -eq $H - 3)) { [void]$sb.Append("E") }
            elseif ($y -eq $H - 2) { [void]$sb.Append("b") }
            else { [void]$sb.Append("B") }
        }
        $rows += $sb.ToString()
    }
    return $rows
}

# Car facing left (it drives right to left): headlight on the left, tail light on the right.
$carRows = @(
    "............KKKKKKKKKKK.......",
    "...........KRRRRRRRRRRRK......",
    "..........KRWWWWKWWWWWRRK.....",
    ".........KRWwWWWKWwWWWWRRK....",
    "........KRRWWWWWKWWWWWWWRRK...",
    "...KKKKKRRRRRRRRRRRRRRRRRRRKK.",
    "..KYYRRRRRRRRRRRRRRRRRRRRRRRLK",
    "..KYYRRRRRRRRRRRRRRRRRRRRRRRLK",
    "..KRRRRrrrrrrrrrrrrrrrrrrrrRRK",
    "..KSSSrrrKKKKrrrrrrrrKKKKrrSSK",
    "...KKKKKGGGGKKKKKKKKKGGGGKKKK.",
    "......KGGggGGK.....KGGggGGK...",
    "......KGgggGGK.....KGgggGGK...",
    ".......KGGGGK.......KGGGGK....",
    "........KKKK.........KKKK....."
)
$carPalette = New-Map
$carPalette["K"] = New-Brush "#1B1B1F"
$carPalette["R"] = New-Brush "#E8413C"
$carPalette["r"] = New-Brush "#B52A2A"
$carPalette["W"] = New-Brush "#9FD8FF"
$carPalette["w"] = New-Brush "#FFFFFF"
$carPalette["Y"] = New-Brush "#FFE066"
$carPalette["L"] = New-Brush "#FF7A59"
$carPalette["S"] = New-Brush "#C9CED6"
$carPalette["G"] = New-Brush "#3A3A42"
$carPalette["g"] = New-Brush "#9AA0AA"

$ropeRows = @(
    "KK............KK",
    "..KK........KK..",
    "....KKKKKKKK...."
)
$ropePalette = New-Map
$ropePalette["K"] = New-Brush "#1B1B1F"

$bannerPalette = New-Map
$bannerPalette["K"] = New-Brush "#1B1B1F"
$bannerPalette["B"] = New-Brush "#FFF6DC"
$bannerPalette["b"] = New-Brush "#EBDDB5"
$bannerPalette["E"] = New-Brush "#9AA0AA"

$textPalette = New-Map
$textPalette["T"] = New-Brush "#1B1B1F"
$textPalette["O"] = New-Brush "#F29A13"
$textPalette["S"] = New-Brush "#6B6658"

# --- Build the sprites ---
$title = $Title.ToUpper()
$titleColors = ("T" * $title.Length).ToCharArray()
$lc = $title.IndexOf("LEETCODE")
if ($lc -ge 0) { for ($i = $lc; $i -lt $lc + 8; $i++) { $titleColors[$i] = "O" } }

$carP = 7
$car = New-PixelLayer $carRows $carPalette $carP
$titleLayer = New-PixelLayer (Get-TextRows $title (-join $titleColors) -Bold) $textPalette 7
$subLayer = $null
if ($Subtitle) { $subLayer = New-PixelLayer (Get-TextRows $Subtitle.ToUpper() ("S" * $Subtitle.Length)) $textPalette 3 }

$U = 6
$pad = 24
$contentW = $titleLayer.Width
$contentH = $titleLayer.Height
if ($subLayer) {
    $contentW = [Math]::Max($contentW, $subLayer.Width)
    $contentH += 12 + $subLayer.Height
}
$cellsW = [int][Math]::Ceiling(($contentW + 2 * $pad) / $U)
$cellsH = [int][Math]::Ceiling(($contentH + 2 * $pad) / $U)
$bannerCloth = New-PixelLayer (Get-BannerRows $cellsW $cellsH) $bannerPalette $U

$banner = [System.Windows.Controls.Canvas]::new()
$banner.Width = $bannerCloth.Width
$banner.Height = $bannerCloth.Height
[void]$banner.Children.Add($bannerCloth)
[System.Windows.Controls.Canvas]::SetLeft($titleLayer, [Math]::Round(($banner.Width - $titleLayer.Width) / 2 / $U) * $U)
[System.Windows.Controls.Canvas]::SetTop($titleLayer, $pad)
[void]$banner.Children.Add($titleLayer)
if ($subLayer) {
    [System.Windows.Controls.Canvas]::SetLeft($subLayer, [Math]::Round(($banner.Width - $subLayer.Width) / 2 / 3) * 3)
    [System.Windows.Controls.Canvas]::SetTop($subLayer, $pad + $titleLayer.Height + 12)
    [void]$banner.Children.Add($subLayer)
}

$rope = New-PixelLayer $ropeRows $ropePalette 4

# Car, rope, banner side by side; rope and banner centre line up with the car's tail light.
$hitchY = 6.5 * $carP
$bannerTop = $hitchY - $banner.Height / 2
$shift = [Math]::Max(0, -$bannerTop) + 8
$group = [System.Windows.Controls.Canvas]::new()
$group.Width = $car.Width + $rope.Width + $banner.Width
$group.Height = [Math]::Max($car.Height, $banner.Height) + $shift + 12
[System.Windows.Controls.Canvas]::SetLeft($car, 0)
[System.Windows.Controls.Canvas]::SetTop($car, $shift)
[System.Windows.Controls.Canvas]::SetLeft($rope, $car.Width - 2)
[System.Windows.Controls.Canvas]::SetTop($rope, $shift + $hitchY - 2)
[System.Windows.Controls.Canvas]::SetLeft($banner, $car.Width + $rope.Width - 4)
[System.Windows.Controls.Canvas]::SetTop($banner, $shift + $bannerTop)
[void]$group.Children.Add($rope)
[void]$group.Children.Add($banner)
[void]$group.Children.Add($car)

$shadow = [System.Windows.Media.Effects.DropShadowEffect]::new()
$shadow.Color = [System.Windows.Media.Colors]::Black
$shadow.BlurRadius = 0
$shadow.ShadowDepth = 6
$shadow.Direction = 315
$shadow.Opacity = 0.35
$group.Effect = $shadow
$group.Cursor = [System.Windows.Input.Cursors]::Hand
$group.ToolTip = "Open prepboard"

# --- Window: transparent, topmost, full screen width ---
$screenW = [System.Windows.SystemParameters]::PrimaryScreenWidth
$screenH = [System.Windows.SystemParameters]::PrimaryScreenHeight

$win = [System.Windows.Window]::new()
$win.WindowStyle = [System.Windows.WindowStyle]::None
$win.AllowsTransparency = $true
$win.Background = [System.Windows.Media.Brushes]::Transparent
$win.Topmost = $true
$win.ShowInTaskbar = $false
$win.ShowActivated = $false
$win.ResizeMode = [System.Windows.ResizeMode]::NoResize
$win.Left = 0
$win.Top = [Math]::Round($screenH * 0.14)
$win.Width = $screenW
$win.Height = $group.Height + 10
$win.Title = "prepboard nudge"

$stage = [System.Windows.Controls.Canvas]::new()
$stage.ClipToBounds = $true
[void]$stage.Children.Add($group)
[System.Windows.Controls.Canvas]::SetTop($group, 0)
[System.Windows.Controls.Canvas]::SetLeft($group, $screenW)
$win.Content = $stage

$group.Add_MouseLeftButtonDown({
    try { Start-Process $Url } catch {}
    $win.Close()
})

$win.Add_Loaded({
    try { [System.Media.SystemSounds]::Exclamation.Play() } catch {}

    # Drive across the screen.
    $drive = [System.Windows.Media.Animation.DoubleAnimation]::new($screenW, -$group.Width, [System.Windows.Duration]::new([TimeSpan]::FromSeconds($Seconds)))
    $drive.Add_Completed({ $win.Close() })
    $group.BeginAnimation([System.Windows.Controls.Canvas]::LeftProperty, $drive)

    # The car bounces a little on its wheels.
    $bob = [System.Windows.Media.TranslateTransform]::new()
    $car.RenderTransform = $bob
    $bounce = [System.Windows.Media.Animation.DoubleAnimation]::new(0, -3, [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(170)))
    $bounce.AutoReverse = $true
    $bounce.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever
    $bob.BeginAnimation([System.Windows.Media.TranslateTransform]::YProperty, $bounce)

    # The banner flaps in the wind.
    $skew = [System.Windows.Media.SkewTransform]::new(0, 0, 0, $banner.Height / 2)
    $banner.RenderTransform = $skew
    $flap = [System.Windows.Media.Animation.DoubleAnimation]::new(-1.2, 1.6, [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(420)))
    $flap.AutoReverse = $true
    $flap.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever
    $skew.BeginAnimation([System.Windows.Media.SkewTransform]::AngleYProperty, $flap)
})

# Safety net: never stay on screen longer than the drive plus a few seconds.
$timer = [System.Windows.Threading.DispatcherTimer]::new()
$timer.Interval = [TimeSpan]::FromSeconds($Seconds + 4)
$timer.Add_Tick({ $timer.Stop(); $win.Close() })
$timer.Start()

[void]$win.ShowDialog()
