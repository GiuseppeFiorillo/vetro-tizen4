[CmdletBinding(SupportsShouldProcess=$true,ConfirmImpact='High')]
param([switch]$List,[ValidateSet('Install','Recovery')][string]$Mode,[int]$DiskNumber=-1,[string]$ExpectedUniqueId,[switch]$Erase)
$ErrorActionPreference='Stop'
if($List){Get-Disk | Where-Object BusType -eq USB | Select-Object Number,FriendlyName,Size,UniqueId,IsBoot,IsSystem;return}
if(!$Erase -or !$Mode -or $DiskNumber -lt 0 -or [string]::IsNullOrWhiteSpace($ExpectedUniqueId)){throw 'Use -List first, then provide -Mode, -DiskNumber, exact -ExpectedUniqueId and -Erase.'}
$identity=$null
function Assert-Usb {
 $d=Get-Disk -Number $DiskNumber
 if($d.BusType -ne 'USB' -or $d.IsBoot -or $d.IsSystem -or $d.IsReadOnly -or $d.IsOffline -or $d.UniqueId -ne $ExpectedUniqueId){throw 'Refusing target: USB identity or system-disk guard failed.'}
 if($identity -and ($d.SerialNumber -ne $identity.SerialNumber -or $d.Size -ne $identity.Size -or $d.FriendlyName -ne $identity.FriendlyName)){throw 'USB hardware identity changed.'}
 return $d
}
$identity=Assert-Usb
$image=Join-Path $PSScriptRoot ($Mode.ToUpper()+'.img')
$manifest=Get-Content -Raw (Join-Path $PSScriptRoot 'IMAGES.json') | ConvertFrom-Json
$entry=$manifest.($Mode.ToUpper()+'.img')
if(!$entry -or (Get-Item -LiteralPath $image).Length -ne $entry.bytes -or (Get-FileHash -LiteralPath $image -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256){throw 'Image verification failed.'}
if($identity.Size -lt $entry.bytes){throw 'USB is too small.'}
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Run this writer from Administrator PowerShell.'}
if(!$PSCmdlet.ShouldProcess(('Disk {0}: {1}, {2} bytes, ID {3}' -f $DiskNumber,$identity.FriendlyName,$identity.Size,$ExpectedUniqueId),'ERASE all data and write the verified '+$Mode+' image')){return}
$null=Assert-Usb
Clear-Disk -Number $DiskNumber -RemoveData -RemoveOEM -Confirm:$false
$null=Assert-Usb
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Security.Cryptography;
public static class VetroPackageWriter {
 public static string Write(int number,string image,long length) {
  if(number<0||length<=0)throw new ArgumentException();
  using(var disk=new FileStream(@"\\.\PhysicalDrive"+number,FileMode.Open,FileAccess.ReadWrite,FileShare.ReadWrite,1048576,FileOptions.WriteThrough)) {
   byte[] b=new byte[1048576];disk.Position=0;
   using(var input=File.OpenRead(image)){if(input.Length!=length)throw new Exception("Image size changed");int n;while((n=input.Read(b,0,b.Length))>0)disk.Write(b,0,n);}
   disk.Flush(true);disk.Position=0;
   using(var sha=SHA256.Create()){long left=length;while(left>0){int n=disk.Read(b,0,(int)Math.Min(left,b.Length));if(n<=0)throw new Exception("Incomplete readback");sha.TransformBlock(b,0,n,b,0);left-=n;}sha.TransformFinalBlock(new byte[0],0,0);return BitConverter.ToString(sha.Hash).Replace("-","").ToLowerInvariant();}
  }
 }
}
'@
$readback=[VetroPackageWriter]::Write($DiskNumber,$image,[long]$entry.bytes)
if($readback -ne $entry.sha256){throw 'USB read-back verification failed. Do not insert it into the TV.'}
Update-Disk -Number $DiskNumber
[ordered]@{mode=$Mode;diskNumber=$DiskNumber;bytesWritten=$entry.bytes;readbackVerified=$true;sha256=$readback;finished=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'last-write-result.json') -Encoding utf8
Write-Output 'Write and full read-back verification passed. Safely eject the USB before moving it.'
