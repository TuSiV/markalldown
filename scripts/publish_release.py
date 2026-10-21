#!/usr/bin/env python3
"""Publish a new stable version from its fully accepted main-branch build."""
import json
import os
from pathlib import Path
import re
import time
from publish_prerelease import gh, find_release, optional_api, prepare, verify_assets


def assert_target(release, tag, source):
    if tag:
        assert tag['object']['type'] == 'commit' and tag['object']['sha'] == source, 'Tag belongs to another commit'
    if release:
        assert release['target_commitish'] == source, 'Release belongs to another commit'
        assert not release['prerelease'], 'Refusing to replace a prerelease'


def wait_for_draft(repo, tag):
    # GitHub may not list a just-created draft immediately.
    for attempt in range(8):
        release = find_release(repo, tag)
        if release:
            assert release['draft'], 'Expected a draft release'
            return release
        if attempt < 7:
            time.sleep(2)
    raise AssertionError('Created release draft is not yet visible; retry publication')


def main():
    repo, source = os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_SHA']
    version = json.loads(Path('package.json').read_text())['version']
    assert re.fullmatch(r'\d+\.\d+\.\d+', version) and version != '3.0.0', 'Expected a new stable version'
    run = json.loads(gh('api', f'repos/{repo}/actions/runs/{os.environ["GITHUB_RUN_ID"]}'))
    assert run['head_sha'] == source and run['head_branch'] == 'main' and run['event'] == 'push'
    jobs = json.loads(gh('api', f'repos/{repo}/actions/runs/{run["id"]}/jobs?per_page=100'))['jobs']
    required = {'native (windows-2022, windows-x64)', 'native (macos-15, macos-arm64)',
                'native (macos-15-intel, macos-x64)', 'ui-visual', 'browser-acceptance / browser'}
    assert required <= {j['name'] for j in jobs if j['conclusion'] == 'success'}, 'Acceptance incomplete'
    files = prepare(version, Path('installers'), Path('ui-screenshots'), Path('release-assets'), include_msi=True)
    tag = 'v' + version
    release = find_release(repo, tag)
    assert_target(release, optional_api(f'repos/{repo}/git/ref/tags/{tag}'), source)
    if release and not release['draft']:
        verify_assets(release, files)
        print(release['html_url'])
        return
    assert json.loads(gh('api', f'repos/{repo}/git/ref/heads/main'))['object']['sha'] == source, 'Main moved; inspect before publishing'
    if not release:
        gh('release', 'create', tag, '--target', source, '--draft', '--latest=false',
           '--title', f'MarkAllDown {version}', '--notes-file', 'RELEASE_NOTES.md')
    release = wait_for_draft(repo, tag)
    assert_target(release, optional_api(f'repos/{repo}/git/ref/tags/{tag}'), source)
    gh('release', 'upload', tag, *(str(p) for p in files), '--clobber')
    verify_assets(find_release(repo, tag), files)
    assert json.loads(gh('api', f'repos/{repo}/git/ref/heads/main'))['object']['sha'] == source, 'Main moved; inspect before publishing'
    gh('release', 'edit', tag, '--draft=false', '--prerelease=false', '--latest')
    final = find_release(repo, tag)
    assert final and not final['draft'] and not final['prerelease']
    assert_target(final, optional_api(f'repos/{repo}/git/ref/tags/{tag}'), source)
    verify_assets(final, files)
    assert json.loads(gh('api', f'repos/{repo}/releases/latest'))['id'] == final['id']
    print(final['html_url'])


if __name__ == '__main__':
    main()
