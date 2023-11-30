
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true,Position = 1)] [String] $IgcDir        
)

function Convert-Igc2kml {
    [CmdletBinding()]
    Param(
        [Parameter(ValueFromPipeline)]
        [Alias('Igc', 'IgcPath')]
        [System.Object[]]$Object,
        [String]$IgcDir        
    )
    $Igc2KmlPath = "./dist/igc2kmz.cmd.js"
    $dest = "$($Object).kml"
    Write-Host "convert $Object to $dest"
    & node $Igc2KmlPath $Object --output $dest | Write-Verbose
}

Get-ChildItem -Recurse -Filter *.igc -Path $IgcDir | Foreach-Object { $_|Convert-Igc2kml }
