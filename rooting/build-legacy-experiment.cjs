'use strict';
// Offline compilation experiment. Never selected by the adapter or packaged.
// Retained C# sources are Unlicense; see THIRD_PARTY_NOTICES.md.
const fs = require('fs'), path = require('path'), os = require('os');
const {spawnSync} = require('child_process');
function legacySource(name, text) {
    if (name !== 'SamsungTvArchiveRoot') return text;
    const before = `            start.ArgumentList.Add("--package_name");
            start.ArgumentList.Add(package);
            start.ArgumentList.Add("-xzf");
            start.ArgumentList.Add(StagingRoot + "on-demand/" + package + ".tar.gz");
            start.ArgumentList.Add("--to-command=/bin/sh");`;
    if (!text.includes(before)) throw Error('Archive launcher source changed; review argument conversion');
    // package is validated by ValidPackage (archive-root- followed by hex), and
    // StagingRoot is a constant without spaces. No arbitrary argument is added.
    if (!text.includes('!ValidPackage(arguments[0])')) throw Error('Package validation missing');
    return text.replace(before, `            start.Arguments = "--package_name " + package + " -xzf "
                + StagingRoot + "on-demand/" + package + ".tar.gz --to-command=/bin/sh";`);
}
function build() {
    const destination = process.env.OUT ? path.resolve(process.env.OUT) : path.join(__dirname, 'dist', 'legacy-net2-experiment');
    if (destination === path.join(__dirname, 'payload') || destination.startsWith(path.join(__dirname, 'payload') + path.sep)) {
        throw Error('Experimental output must not enter packaged payload');
    }
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'vetro-legacy-'));
    try {
        for (const name of ['SamsungTvArchiveRoot', 'SamsungTvRootAgent']) {
            const dir = path.join(temporary, name); fs.mkdirSync(dir);
            const source = fs.readFileSync(path.join(__dirname, 'tools/samsung-tv-root-master/payloads/common', name + '.cs'), 'utf8');
            fs.writeFileSync(path.join(dir, name + '.cs'), legacySource(name, source));
            const project = path.join(dir, name + '.csproj');
            fs.writeFileSync(project, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<TargetFramework>netcoreapp2.0</TargetFramework><OutputType>Exe</OutputType><UseAppHost>false</UseAppHost>
<AssemblyName>${name}</AssemblyName><ImplicitUsings>disable</ImplicitUsings><Nullable>disable</Nullable>
<Deterministic>true</Deterministic><DebugType>none</DebugType>
</PropertyGroup></Project>`);
            const output = path.join(destination, name);
            const result = spawnSync(process.env.DOTNET || 'dotnet', ['build', project, '-c', 'Release', '-o', output, '--nologo'], {stdio: 'inherit'});
            if (result.error) throw result.error;
            if (result.status !== 0) throw Error('Legacy API compilation failed: ' + name);
        }
        console.log('EXPERIMENT ONLY: .NET 2.0 compile succeeds; runtime, ABI and privilege route remain unverified. ' + destination);
    } finally { fs.rmSync(temporary, {recursive: true, force: true}); }
}
module.exports = {legacySource, build};
if (require.main === module) build();
