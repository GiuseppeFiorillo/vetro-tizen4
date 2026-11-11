'use strict';
// Builds an unsigned Vetro package that uses the Kant-M2 local root daemon.
//
// It reuses the app's file list and ZIP writer, replaces the standalone
// platform adapter with chain/service/platform.js, and adds the loopback
// server and the root-side daemon. Signing and installation are separate
// steps: this script never touches the TV.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app');
const DIST = path.join(__dirname, 'dist');

// The tizen4-public profile drops every native/ file, because the stock app-only package has
// no use for the .NET helpers. The launcher does: the dashboard reports it as "not in this
// package" unless the assemblies and the res/ images are installed with Vetro. Both builds
// are shipped; dock.js picks the one this TV's runtime can start.
function nativeDockFiles() {
    const dockDir = path.join(APP, 'native', 'dock');
    const files = ['tvlauncher-dotnet.dll', 'tvlauncher-dotnet.runtimeconfig.json',
        'tvlauncher-dotnet-2.0.dll', 'tvlauncher-dotnet-2.0.runtimeconfig.json']
        .filter(name => fs.existsSync(path.join(dockDir, name)))
        .map(name => ({uri: encodeURIComponent('native/dock/' + name), data: fs.readFileSync(path.join(dockDir, name))}));
    const resRoot = path.join(ROOT, 'dock', 'res');
    (function walk(dir, rel) {
        fs.readdirSync(dir).sort().forEach(name => {
            const full = path.join(dir, name), next = rel ? rel + '/' + name : name;
            if (fs.statSync(full).isDirectory()) walk(full, next);
            else if (/\.(png|tsv)$/.test(name)) {
                files.push({uri: encodeURIComponent('native/dock/res/' + next), data: fs.readFileSync(full)});
            }
        });
    })(resRoot, '');
    return files;
}

function collectChainFiles() {
    const previous = process.env.VETRO_PROFILE;
    process.env.VETRO_PROFILE = 'tizen4-public';
    let files;
    try {
        files = require(path.join(APP, 'build.cjs')).collectFiles();
    } finally {
        if (previous === undefined) delete process.env.VETRO_PROFILE;
        else process.env.VETRO_PROFILE = previous;
    }

    // The app-only adapter is replaced, not merged.
    files = files.filter(file => decodeURIComponent(file.uri) !== 'service/platform.js');

    // The public profile filters native/ out of the base list; put the launcher back.
    const present = new Set(files.map(file => decodeURIComponent(file.uri)));
    nativeDockFiles().forEach(file => {
        if (!present.has(decodeURIComponent(file.uri))) { files.push(file); present.add(decodeURIComponent(file.uri)); }
    });

    const serviceFiles = ['platform.js', 'root-agent-server.js', 'debloat-commands.js'];
    serviceFiles.forEach(name => {
        files.push({
            uri: encodeURIComponent('service/' + name),
            data: fs.readFileSync(path.join(__dirname, 'service', name))
        });
    });

    // Keep the root-side daemon in the package so it can be extracted from the
    // installed app by a root shell; it is not loaded by the web service.
    files.push({
        uri: encodeURIComponent('root-daemon/root-daemon.js'),
        data: fs.readFileSync(path.join(__dirname, 'daemon', 'root-daemon.js'))
    });
    files.push({
        uri: encodeURIComponent('root-daemon/README.md'),
        data: Buffer.from([
            'Root-side daemon for the Kant-M2 USB chain.',
            '',
            'Run it as uid 0 with:',
            '  /usr/bin/node -e \'require("/path/to/root-daemon.js")\'',
            '',
            'It reads /opt/usr/home/owner/share/vetro-root-request.json (or',
            '/tmp/vetro-root-request.json), connects to Vetro on 127.0.0.1 and',
            'speaks SAMSUNG-TV-ROOT/1. Without uid 0 it exits.'
        ].join('\n') + '\n')
    });

    return files;
}

function build() {
    const output = process.env.OUT
        ? path.resolve(process.env.OUT)
        : path.join(DIST, 'vetro-chain-unsigned.wgt');
    const files = collectChainFiles();
    const zip = require(path.join(APP, 'build.cjs')).zip;
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, zip(files));
    console.log('Chain unsigned package: ' + output);
    console.log('Entries: ' + files.length);
    return output;
}

module.exports = { collectChainFiles, build };
if (require.main === module) build();
