#!/usr/bin/env python3
"""Publish only the verified native artifacts from this workflow's exact commit."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import zipfile


def gh(*args):
    return subprocess.check_output(['gh', *args], text=True).strip()


def optional_api(endpoint):
    result = subprocess.run(['gh', 'api', endpoint], text=True, capture_output=True)
    if result.returncode == 0:
        return json.loads(result.stdout)
    if 'HTTP 404' in result.stderr:
        return None
    raise RuntimeError(result.stderr)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def prepare(version, installers, screenshots, output):
    assert re.fullmatch(r'\d+\.\d+\.\d+-rc\.\d+', version), 'Expected an explicit RC version'
    expected = {
        f'MarkAllDown_{version}_x64-setup.exe',
        f'MarkAllDown_{version}_aarch64.dmg',
        f'MarkAllDown_{version}_x64.dmg',
    }
    native = [p for p in installers.rglob('*') if p.is_file() and p.suffix in {'.exe', '.dmg', '.msi'}]
    assert len(native) == 3 and {p.name for p in native} == expected, 'Native artifact set is incomplete or has a mismatched version'
    images = sorted(screenshots.glob('*.png'))
    assert len(images) >= 20, 'UI rendering evidence is incomplete'
    output.mkdir(parents=True, exist_ok=True)
    assert not any(output.iterdir()), 'Release output directory must be empty'
    for path in native:
        shutil.copy2(path, output / path.name)
    archive = output / f'MarkAllDown_{version}_UI-screenshots.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for image in images:
            info = zipfile.ZipInfo(image.name, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            bundle.writestr(info, image.read_bytes())
    files = sorted(output.iterdir())
    (output / 'SHA256SUMS.txt').write_text(''.join(f'{digest(p)}  {p.name}\n' for p in files), encoding='utf8')
    return sorted(output.iterdir())


def verify_assets(release, files):
    assets = release['assets']
    assert len(assets) == len(files), 'Unexpected release asset count'
    actual = {asset['name']: asset for asset in assets}
    assert actual.keys() == {path.name for path in files}, 'Unexpected release asset names'
    for path in files:
        asset = actual[path.name]
        assert asset['state'] == 'uploaded' and asset['size'] == path.stat().st_size, f'Incomplete asset: {path.name}'
        if asset.get('digest'):
            assert asset['digest'] == 'sha256:' + digest(path), f'Digest mismatch: {path.name}'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--installers', type=Path, default=Path('installers'))
    parser.add_argument('--screenshots', type=Path, default=Path('ui-screenshots'))
    parser.add_argument('--output', type=Path, default=Path('release-assets'))
    args = parser.parse_args()
    version = json.loads(Path('package.json').read_text())['version']
    files = prepare(version, args.installers, args.screenshots, args.output)
    if args.prepare_only:
        print('Prepared and checksummed:', ', '.join(p.name for p in files))
        return
    repository, commit = os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_SHA']
    tag = 'v' + version
    endpoint = f'repos/{repository}/releases/tags/{tag}'
    existing_tag = optional_api(f'repos/{repository}/git/ref/tags/{tag}')
    if existing_tag:
        assert existing_tag['object']['type'] == 'commit' and existing_tag['object']['sha'] == commit, 'Tag belongs to another commit'
    release = optional_api(endpoint)
    if release:
        assert release['target_commitish'] == commit, 'Existing release belongs to another commit'
        if not release['draft']:
            assert release['prerelease'], 'Refusing to modify a stable release'
            verify_assets(release, files)
            print(release['html_url'])
            return
    else:
        gh('release', 'create', tag, '--target', commit, '--draft', '--prerelease', '--latest=false',
           '--title', f'MarkAllDown {tag} · 桌面视觉优化预发布', '--notes-file', 'RELEASE_NOTES.md')
    # Resume only a draft owned by this same commit. Never overwrite a public asset.
    gh('release', 'upload', tag, *(str(path) for path in files), '--clobber')
    verify_assets(json.loads(gh('api', endpoint)), files)
    gh('release', 'edit', tag, '--draft=false', '--prerelease', '--latest=false')
    release = json.loads(gh('api', endpoint))
    assert release['prerelease'] and not release['draft'], 'Publication did not finish as a prerelease'
    verify_assets(release, files)
    print(release['html_url'])


if __name__ == '__main__':
    main()
