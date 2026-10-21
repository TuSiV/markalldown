#!/usr/bin/env python3
"""Replace the explicitly authorized 3.0.0 prerelease with freshly verified builds."""
import json
import os
from pathlib import Path
from publish_prerelease import gh, find_release, optional_api, prepare, verify_assets

OLD_SOURCE = '6090b7a12d939377edd323fe39cf93b65b97bd0e'
RELEASE_ID = 414450383

def assert_replacement_target(release, tag, source):
    assert release and release['id'] == RELEASE_ID, 'Unexpected release'
    assert release['prerelease'] or release['draft'] or release['target_commitish'] == source, 'Refusing to replace another stable release'
    assert tag and tag['object']['type'] == 'commit', 'Expected a commit tag'
    assert tag['object']['sha'] in (OLD_SOURCE, source), 'Release tag moved unexpectedly'

def main():
    if json.loads(Path('package.json').read_text())['version'] != '3.0.0':
        from publish_release import main as publish_release
        return publish_release()
    repo, source = os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_SHA']
    run_id = os.environ['GITHUB_RUN_ID']
    assert json.loads(Path('package.json').read_text())['version'] == '3.0.0'
    main_ref = json.loads(gh('api', f'repos/{repo}/git/ref/heads/main'))
    assert main_ref['object']['sha'] == source, 'Main moved; inspect before publishing'
    run = json.loads(gh('api', f'repos/{repo}/actions/runs/{run_id}'))
    assert run['head_sha'] == source and run['head_branch'] == 'main'
    jobs = json.loads(gh('api', f'repos/{repo}/actions/runs/{run_id}/jobs?per_page=100'))['jobs']
    required = {'native (windows-2022, windows-x64)', 'native (macos-15, macos-arm64)',
                'native (macos-15-intel, macos-x64)', 'ui-visual', 'browser-acceptance / browser'}
    assert required <= {j['name'] for j in jobs if j['conclusion'] == 'success'}, 'Acceptance incomplete'
    tag = 'v3.0.0'
    release = find_release(repo, tag)
    current_tag = optional_api(f'repos/{repo}/git/ref/tags/{tag}')
    assert_replacement_target(release, current_tag, source)
    files = prepare('3.0.0', Path('installers'), Path('ui-screenshots'), Path('release-assets'), include_msi=True)
    # Verify a complete second copy before hiding/replacing the public prerelease.
    staging = f'v3.0.0-build-{run_id}'
    if not find_release(repo, staging):
        gh('release', 'create', staging, '--target', source, '--draft', '--prerelease',
           '--latest=false', '--title', 'Temporary verified 3.0.0 build', '--notes', 'Staged for replacement after full acceptance.')
    gh('release', 'upload', staging, *(str(p) for p in files), '--clobber')
    verify_assets(find_release(repo, staging), files)
    # Recheck both refs immediately before changing the explicitly authorized release.
    assert json.loads(gh('api', f'repos/{repo}/git/ref/heads/main'))['object']['sha'] == source
    release = find_release(repo, tag)
    assert_replacement_target(release, optional_api(f'repos/{repo}/git/ref/tags/{tag}'), source)
    endpoint = f'repos/{repo}/releases/{release["id"]}'
    gh('api', endpoint, '--method', 'PATCH', '-F', 'draft=true')
    gh('release', 'upload', tag, *(str(p) for p in files), '--clobber')
    verify_assets(find_release(repo, tag), files)
    gh('api', f'repos/{repo}/git/refs/tags/{tag}', '--method', 'PATCH', '-f', 'sha='+source, '-F', 'force=true')
    payload = {'tag_name': tag, 'target_commitish': source, 'name': 'MarkAllDown 3.0.0',
               'body': Path('RELEASE_NOTES.md').read_text(encoding='utf8'),
               'draft': False, 'prerelease': False, 'make_latest': 'true'}
    body = Path('stable-release.json')
    body.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf8')
    gh('api', endpoint, '--method', 'PATCH', '--input', str(body))
    final = find_release(repo, tag)
    assert not final['prerelease'] and not final['draft'] and final['target_commitish'] == source
    verify_assets(final, files)
    assert optional_api(f'repos/{repo}/git/ref/tags/{tag}')['object']['sha'] == source
    assert json.loads(gh('api', f'repos/{repo}/releases/latest'))['id'] == RELEASE_ID
    gh('release', 'delete', staging, '--yes')
    print(final['html_url'])

if __name__ == '__main__':
    main()
