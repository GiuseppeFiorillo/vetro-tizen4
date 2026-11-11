#!/bin/sh
# Builds the dock and copies the files the Vetro package needs into app/native/dock/.
# Both target frameworks are shipped: netcoreapp3.1 for TVs with /usr/bin/dotnet, and
# netcoreapp2.0 for the older sets that only have /usr/share/dotnet/corerun. dock.js picks
# at runtime; the package does not know which TV it will be installed on.
# The images come straight from dock/res when the package is built (app/build.cjs).
set -e
cd "$(dirname "$0")"
DOTNET=${DOTNET:-dotnet}

"$DOTNET" build -c Release Launcher.csproj
cp bin/Release/netcoreapp3.1/tvlauncher-dotnet.dll bin/Release/netcoreapp3.1/tvlauncher-dotnet.runtimeconfig.json ../app/native/dock/

"$DOTNET" build -c Release -p:VetroLauncherTfm=netcoreapp2.0 Launcher.csproj
cp bin/Release/netcoreapp2.0/tvlauncher-dotnet-2.0.dll ../app/native/dock/tvlauncher-dotnet-2.0.dll
cp bin/Release/netcoreapp2.0/tvlauncher-dotnet-2.0.runtimeconfig.json ../app/native/dock/tvlauncher-dotnet-2.0.runtimeconfig.json

echo "copied to app/native/dock/"
