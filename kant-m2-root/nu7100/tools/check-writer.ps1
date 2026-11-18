# Parse and compile the writer's C# helper. Never invoke the disk-writing method.
$ErrorActionPreference='Stop'
$script=Join-Path $PSScriptRoot '../usb/Write-Usb.ps1'
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($script,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors | Out-String)}
$commands=@($ast.FindAll({param($node) $node -is [System.Management.Automation.Language.CommandAst] -and $node.GetCommandName() -eq 'Add-Type'},$true))
if($commands.Count -ne 1){throw 'Expected one isolated writer helper definition'}
$strings=@($commands[0].CommandElements | Where-Object {$_ -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $_.Value.Contains('public static class VetroPackageWriter')})
if($strings.Count -ne 1){throw 'Writer helper source was not found'}
Add-Type -TypeDefinition $strings[0].Value
Write-Output 'PASS writer PowerShell parsing and C# helper compilation; no disk opened'
