Add-Type -AssemblyName System.Drawing

function Resize-Image {
    param(
        [string]$sourcePath,
        [string]$destinationPath,
        [int]$width,
        [int]$height
    )
    $src = [System.Drawing.Image]::FromFile($sourcePath)
    $dest = New-Object System.Drawing.Bitmap($width, $height)
    $g = [System.Drawing.Graphics]::FromImage($dest)
    
    # Set high quality settings
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    # Clear with transparent (or white if we want a solid white back)
    # The user says: "for first screen show white background behind the logo not black"
    # The PWA manifest handles background_color, but for icons, keeping transparency or having a clean icon is best.
    # Let's clear with transparent color so that it works perfectly as a standard PWA app icon.
    $g.Clear([System.Drawing.Color]::Transparent)
    
    # Draw image
    $g.DrawImage($src, 0, 0, $width, $height)
    
    $dest.Save($destinationPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $dest.Dispose()
    $src.Dispose()
}

$logoPath = "C:\Users\DELL\.gemini\antigravity\scratch\tfl-cloud-kitchen\tfl_logo.png"

# Resize and overwrite root icons
Resize-Image $logoPath "C:\Users\DELL\.gemini\antigravity\scratch\tfl-cloud-kitchen\tfl-app-icon-v43-192.png" 192 192
Resize-Image $logoPath "C:\Users\DELL\.gemini\antigravity\scratch\tfl-cloud-kitchen\tfl-app-icon-v43-512.png" 512 512
Resize-Image $logoPath "C:\Users\DELL\.gemini\antigravity\scratch\tfl-cloud-kitchen\tfl-maskable-icon-v43-192.png" 192 192
Resize-Image $logoPath "C:\Users\DELL\.gemini\antigravity\scratch\tfl-cloud-kitchen\tfl-maskable-icon-v43-512.png" 512 512

Write-Host "Icons successfully resized!"
