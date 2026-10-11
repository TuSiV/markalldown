#!/usr/bin/env python3
"""Verify shipped macOS bundle signatures; record Gatekeeper separately."""
import argparse,json,plistlib,subprocess,time
from pathlib import Path

def command(args):
    r=subprocess.run(args,text=True,capture_output=True)
    return {'status':r.returncode,'output':(r.stdout+r.stderr).strip()}

def main():
    p=argparse.ArgumentParser();p.add_argument('app');p.add_argument('--report',required=True);p.add_argument('--version');p.add_argument('--inspect-only',action='store_true');p.add_argument('--quarantine',action='store_true');a=p.parse_args()
    app=Path(a.app).resolve()
    with (app/'Contents/Info.plist').open('rb') as f:info=plistlib.load(f)
    checks={'bundle':command(['codesign','--verify','--deep','--strict','--verbose=2',str(app)])}
    for name in [info['CFBundleExecutable'],'markalldown-server']:
        checks[name]=command(['codesign','--verify','--strict','--verbose=2',str(app/'Contents/MacOS'/name)])
    identity=command(['codesign','--display','--verbose=4',str(app)])
    if a.quarantine:
        subprocess.run(['xattr','-w','com.apple.quarantine',f'0083;{int(time.time()):x};MarkAllDownCI;',str(app)],check=True)
    policy=command(['spctl','--assess','--type','execute','--verbose=4',str(app)])
    result={'version':info['CFBundleShortVersionString'],'signature_checks':checks,'identity':identity,'quarantined':a.quarantine,'gatekeeper':policy,
            'note':'Ad-hoc integrity verification is not Developer ID trust or notarization. Direct binary smoke is not browser/Finder first-launch acceptance.'}
    Path(a.report).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,indent=2))
    if not a.inspect_only:
        assert all(c['status']==0 for c in checks.values()), 'Bundle or bundled executable signature is invalid'
        if a.version:assert result['version']==a.version, 'Bundle version does not match manifest'
if __name__=='__main__':main()
