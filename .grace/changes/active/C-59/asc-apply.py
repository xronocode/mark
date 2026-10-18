#!/usr/bin/env python3
# FILE: .grace/changes/active/C-59/asc-apply.py
# START_MODULE_CONTRACT
#   PURPOSE: C-59 T-003 one-off App Store Connect apply tool — metadata,
#            screenshots and preview video for the 2.5.0 catch-up version.
#   SCOPE: read asc-payload.json; discover app/version/localizations;
#          create or patch version+appInfo localizations for 10 locales;
#          upload screenshot sets and the v5 preview video; read-back status.
#   DEPENDS: python3 stdlib; asc-api.py (JWT helpers) one dir up x3;
#            MARK_ASC_ISSUER env; key at ~/Downloads/AuthKey_*.p8.
#   LINKS: .grace/changes/active/C-59/spec.xml R-3/R-4; store-materials.md.
#   ROLE: SCRIPT
#   MAP_MODE: LOCALS
# END_MODULE_CONTRACT
#
# Usage: MARK_ASC_ISSUER=<uuid> python3 asc-apply.py plan|apply-meta|apply-media|status
# Outward writes only in apply-* modes; plan/status are read-only.
import hashlib, importlib.util, json, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))
SHOTS = os.path.expanduser('~/Downloads/Mark-AppStore-2.3.0')
VIDEO = os.path.expanduser('~/prj/mark-media/videos/mark-app-preview/renders/mark-app-preview-v5-appstore.mp4')
API = "https://api.appstoreconnect.apple.com/v1"

spec = importlib.util.spec_from_file_location('ascapi', os.path.join(REPO, 'tools/release/asc-api.py'))
A = importlib.util.module_from_spec(spec); spec.loader.exec_module(A)

P = json.load(open(os.path.join(HERE, 'asc-payload.json')))
LOCALES = list(P['locales'].keys())
JWT = [None]

def jwt():
    if JWT[0] is None:
        key_path = os.environ.get('MARK_ASC_KEY') or os.path.expanduser('~/Downloads/AuthKey_M665M4B6J3.p8')
        key_id = os.path.splitext(os.path.basename(key_path))[0].replace('AuthKey_', '')
        iss = os.environ.get('MARK_ASC_ISSUER') or sys.exit('set MARK_ASC_ISSUER=<uuid>')
        JWT[0] = A.make_jwt(key_path, key_id, iss)
    return JWT[0]

def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={'Authorization': f'Bearer {jwt()}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return json.load(resp) if resp.status != 204 else {}
    except urllib.error.HTTPError as e:
        err = e.read().decode()[:800]
        raise SystemExit(f'{method} {path} -> {e.code}: {err}')

def discover():
    aid = req('GET', '/apps?filter[bundleId]=com.xronocode.mark&fields[apps]=name')['data'][0]['id']
    vers = req('GET', f'/apps/{aid}/appStoreVersions?limit=10&fields[appStoreVersions]=versionString,appStoreState,platform')['data']
    ver = next((v for v in vers if v['attributes']['versionString'] == P['version'] and v['attributes']['platform'] == 'MAC_OS'), None)
    info = req('GET', f'/apps/{aid}/appInfos?limit=2')['data'][0]['id']
    vlocs = {}
    if ver:
        for l in req('GET', f"/appStoreVersions/{ver['id']}/appStoreVersionLocalizations?limit=30&fields[appStoreVersionLocalizations]=locale,supportUrl,marketingUrl")['data']:
            vlocs[l['attributes']['locale']] = l['id']
    ilocs = {}
    for l in req('GET', f"/appInfos/{info}/appInfoLocalizations?limit=30&fields[appInfoLocalizations]=locale,subtitle,privacyPolicyUrl")['data']:
        ilocs[l['attributes']['locale']] = l['id']
    return aid, ver, info, vlocs, ilocs

def en_urls(vlocs):
    if 'en-US' not in vlocs: return {}, {}
    a = req('GET', f"/appStoreVersionLocalizations/{vlocs['en-US']}?fields[appStoreVersionLocalizations]=supportUrl,marketingUrl")['data']['attributes']
    return {'supportUrl': a.get('supportUrl')}, {'marketingUrl': a.get('marketingUrl')}

def cmd_plan():
    aid, ver, info, vlocs, ilocs = discover()
    print(f"app {aid}; version {P['version']}: " + (f"id={ver['id']} state={ver['attributes']['appStoreState']}" if ver else 'NOT FOUND'))
    print(f"versionLocalizations existing: {sorted(vlocs) or 'none'}")
    print(f"appInfoLocalizations existing: {sorted(ilocs) or 'none'}")
    for loc, m in P['locales'].items():
        act = 'patch' if loc in vlocs else 'create'
        print(f"  {loc:8} {act:6} desc={len(m['description'])} wn={len(m['whatsNew'])} kw={len(m['keywords'])} name={len(m['name'])} sub={len(m['subtitle'])}")
    files = {loc: sorted(f for f in os.listdir(os.path.join(SHOTS, loc)) if f.endswith('.png')) for loc in LOCALES if os.path.isdir(os.path.join(SHOTS, loc))}
    for loc, fs in files.items():
        print(f"  shots {loc:8} {len(fs)} files: {', '.join(fs)}")
    print(f"video: {VIDEO} exists={os.path.exists(VIDEO)} size={os.path.getsize(VIDEO) if os.path.exists(VIDEO) else 0}")

def ensure_version(aid, ver):
    if ver: return ver
    r = req('POST', '/appStoreVersions', {'data': {'type': 'appStoreVersions', 'attributes': {
        'platform': 'MAC_OS', 'versionString': P['version'], 'releaseType': 'MANUAL'},
        'relationships': {'app': {'data': {'type': 'apps', 'id': aid}}}}})
    print(f"version {P['version']} created: {r['data']['id']} (releaseType MANUAL)")
    return r['data']

def appinfo_candidates(aid):
    res = []
    for i in req('GET', f'/apps/{aid}/appInfos?limit=10')['data']:
        locs = {l['attributes']['locale']: l['id'] for l in
                req('GET', f"/appInfos/{i['id']}/appInfoLocalizations?limit=30&fields[appInfoLocalizations]=locale")['data']}
        res.append({'id': i['id'], 'locs': locs})
    return res

def editable_appinfo(aid, sub):
    # live app freezes name/subtitle; the draft created with the new version accepts them
    for cand in appinfo_candidates(aid):
        if 'en-US' not in cand['locs']: continue
        try:
            req('PATCH', f"/appInfoLocalizations/{cand['locs']['en-US']}",
                {'data': {'type': 'appInfoLocalizations', 'id': cand['locs']['en-US'], 'attributes': {'subtitle': sub}}})
            print(f"appInfo {cand['id']}: en-US subtitle patched (editable)")
            return cand
        except SystemExit:
            continue
    raise SystemExit('no editable appInfo found')

def iloc_for(eid, loc):
    # ASC auto-creates an appInfoLocalization when its version localization appears
    for l in req('GET', f"/appInfos/{eid}/appInfoLocalizations?limit=30&fields[appInfoLocalizations]=locale")['data']:
        if l['attributes']['locale'] == loc: return l['id']
    return None

def cmd_apply_meta():
    aid, ver, info, vlocs, ilocs = discover()
    ver = ensure_version(aid, ver)
    vid = ver['id']
    sup, mkt = en_urls(vlocs)
    # export compliance on the build
    b = req('GET', f"/builds?filter[app]={aid}&filter[version]={P['version']}&limit=1&fields[builds]=processingState")['data']
    if b:
        try:
            req('PATCH', f"/builds/{b[0]['id']}", {'data': {'type': 'builds', 'id': b[0]['id'], 'attributes': {'usesNonExemptEncryption': False}}})
            print(f"build {b[0]['id']}: usesNonExemptEncryption=false")
        except SystemExit as e:
            if 'already set' in str(e): print(f"build {b[0]['id']}: usesNonExemptEncryption already set")
            else: raise
    privacy = None
    if 'en-US' in ilocs:
        privacy = req('GET', f"/appInfoLocalizations/{ilocs['en-US']}?fields[appInfoLocalizations]=privacyPolicyUrl")['data']['attributes'].get('privacyPolicyUrl')
    ed = editable_appinfo(aid, P['appInfo_en_subtitle'])
    ilocs = ed['locs']
    for loc in LOCALES:
        m = P['locales'][loc]
        attrs = {'locale': loc, 'description': m['description'], 'whatsNew': m['whatsNew'],
                 'keywords': m['keywords'], 'promotionalText': m['promotionalText']}
        attrs.update({k: v for k, v in {**sup, **mkt}.items() if v})
        if loc in vlocs:
            pattrs = {k: v for k, v in attrs.items() if k != 'locale'}
            req('PATCH', f"/appStoreVersionLocalizations/{vlocs[loc]}", {'data': {'type': 'appStoreVersionLocalizations', 'id': vlocs[loc], 'attributes': pattrs}})
            print(f"vloc {loc}: patched")
        else:
            r = req('POST', '/appStoreVersionLocalizations', {'data': {'type': 'appStoreVersionLocalizations', 'attributes': attrs,
                    'relationships': {'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': vid}}}}})
            vlocs[loc] = r['data']['id']
            print(f"vloc {loc}: created {r['data']['id']}")
        iattrs = {'locale': loc, 'name': m['name'], 'subtitle': m['subtitle']}
        if privacy: iattrs['privacyPolicyUrl'] = privacy
        lid = iloc_for(ed['id'], loc)
        if lid:
            piattrs = {k: v for k, v in iattrs.items() if k != 'locale'}
            req('PATCH', f"/appInfoLocalizations/{lid}", {'data': {'type': 'appInfoLocalizations', 'id': lid, 'attributes': piattrs}})
            print(f"iloc {loc}: patched")
        else:
            r = req('POST', '/appInfoLocalizations', {'data': {'type': 'appInfoLocalizations', 'attributes': iattrs,
                    'relationships': {'appInfo': {'data': {'type': 'appInfos', 'id': ed['id']}}}}})
            print(f"iloc {loc}: created {r['data']['id']}")
        time.sleep(0.5)
    # reviewer notes: upsert appStoreReviewDetail.notes for the version
    ard = req('GET', f"/appStoreVersions/{vid}/appStoreReviewDetail")
    if ard.get('data'):
        rid = ard['data']['id']
        req('PATCH', f"/appStoreReviewDetails/{rid}", {'data': {'type': 'appStoreReviewDetails', 'id': rid,
            'attributes': {'notes': P['reviewer_notes']}}})
        print(f"reviewer notes: patched ({rid})")
    else:
        r = req('POST', '/appStoreReviewDetails', {'data': {'type': 'appStoreReviewDetails',
            'attributes': {'notes': P['reviewer_notes']},
            'relationships': {'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': vid}}}}})
        print(f"reviewer notes: created ({r['data']['id']})")
    json.dump({'vid': vid, 'vlocs': vlocs, 'ilocs': ilocs}, open(os.path.join(HERE, 'asc-apply-state.json'), 'w'))
    print('state saved to asc-apply-state.json')

def put_upload(ops, path):
    # large assets arrive as multiple chunk operations; all must complete
    data = open(path, 'rb').read()
    for op in ops:
        chunk = data[op['offset']:op['offset'] + op['length']]
        r = urllib.request.Request(op['url'], data=chunk, method=op['method'])
        for h in op.get('requestHeaders', []):
            if h['name'].lower() != 'content-length':
                r.add_header(h['name'], h['value'])
        with urllib.request.urlopen(r, timeout=300) as resp:
            assert resp.status in (200, 201, 204), f'upload put {resp.status}'

def desktop_set(lid, kind):
    # kind: 'appScreenshotSets'/'screenshotDisplayType' or 'appPreviewSets'/'previewType'
    is_shot = kind == 'appScreenshotSets'
    rel, attr, val = ('appScreenshotSets', 'screenshotDisplayType', 'APP_DESKTOP') if is_shot else ('appPreviewSets', 'previewType', 'DESKTOP')
    sets = req('GET', f"/appStoreVersionLocalizations/{lid}/{rel}?limit=10&fields[{rel}]={attr}")['data']
    sid = next((s['id'] for s in sets if s['attributes'][attr] == val), None)
    if not sid:
        r = req('POST', f"/{rel}", {'data': {'type': rel, 'attributes': {attr: val},
            'relationships': {'appStoreVersionLocalization': {'data': {'type': 'appStoreVersionLocalizations', 'id': lid}}}}})
        sid = r['data']['id']
        print(f"  created {val} {rel} {sid}")
    return sid

def cmd_apply_media():
    st = json.load(open(os.path.join(HERE, 'asc-apply-state.json'))) if os.path.exists(os.path.join(HERE, 'asc-apply-state.json')) else None
    if st:
        vlocs = st['vlocs']
    else:
        _, ver, _, vlocs, _ = discover()
    for loc in LOCALES:
        locdir = os.path.join(SHOTS, loc)
        fs = sorted(f for f in os.listdir(locdir) if f.endswith('.png'))
        sid = desktop_set(vlocs[loc], 'appScreenshotSets')
        have = req('GET', f"/appScreenshotSets/{sid}/appScreenshots?limit=20&fields[appScreenshots]=fileName")['data']
        for old in have:
            req('DELETE', f"/appScreenshots/{old['id']}")
            print(f"{loc}: removed old screenshot {old['attributes'].get('fileName', old['id'])}")
        for f in fs:
            path = os.path.join(locdir, f)
            md5 = hashlib.md5(open(path, 'rb').read()).hexdigest()
            r = req('POST', '/appScreenshots', {'data': {'type': 'appScreenshots', 'attributes': {
                'fileName': f, 'fileSize': os.path.getsize(path)},
                'relationships': {'appScreenshotSet': {'data': {'type': 'appScreenshotSets', 'id': sid}}}}})
            sc = r['data']
            put_upload(sc['attributes']['uploadOperations'], path)
            req('PATCH', f"/appScreenshots/{sc['id']}", {'data': {'type': 'appScreenshots', 'id': sc['id'],
                'attributes': {'sourceFileChecksum': md5, 'uploaded': True}}})
            print(f"{loc}: uploaded {f} ({sc['id']})")
            time.sleep(0.5)

def cmd_apply_video():
    st = json.load(open(os.path.join(HERE, 'asc-apply-state.json')))
    vlocs = st['vlocs']
    md5 = hashlib.md5(open(VIDEO, 'rb').read()).hexdigest()
    for loc in LOCALES:
        sid = desktop_set(vlocs[loc], 'appPreviewSets')
        have = req('GET', f"/appPreviewSets/{sid}/appPreviews?limit=5&fields[appPreviews]=fileName")['data']
        for oldp in have:
            req('DELETE', f"/appPreviews/{oldp['id']}")
            print(f"{loc}: removed old preview {oldp['id']}")
        r = req('POST', '/appPreviews', {'data': {'type': 'appPreviews', 'attributes': {
            'fileName': os.path.basename(VIDEO), 'fileSize': os.path.getsize(VIDEO), 'mimeType': 'video/mp4'},
            'relationships': {'appPreviewSet': {'data': {'type': 'appPreviewSets', 'id': sid}}}}})
        pv = r['data']
        put_upload(pv['attributes']['uploadOperations'], VIDEO)
        req('PATCH', f"/appPreviews/{pv['id']}", {'data': {'type': 'appPreviews', 'id': pv['id'],
            'attributes': {'sourceFileChecksum': md5, 'uploaded': True}}})
        print(f"{loc}: preview uploaded ({pv['id']})")
        time.sleep(1)

def cmd_status():
    aid, ver, info, vlocs, ilocs = discover()
    print(f"version {P['version']}: {ver['attributes']['appStoreState'] if ver else 'NOT FOUND'}")
    for loc in sorted(vlocs):
        d = req('GET', f"/appStoreVersionLocalizations/{vlocs[loc]}?fields[appStoreVersionLocalizations]=description,whatsNew,keywords")['data']['attributes']
        sid = desktop_set(vlocs[loc], 'appScreenshotSets')
        shots = req('GET', f"/appScreenshotSets/{sid}/appScreenshots?limit=20")['data']
        pid = desktop_set(vlocs[loc], 'appPreviewSets')
        vids = req('GET', f"/appPreviewSets/{pid}/appPreviews?limit=5")['data']
        print(f"  {loc:8} desc={len(d.get('description') or '')} wn={len(d.get('whatsNew') or '')} shots={len(shots)} vids={len(vids)}")

if __name__ == '__main__':
    {'plan': cmd_plan, 'apply-meta': cmd_apply_meta, 'apply-media': cmd_apply_media,
     'apply-video': cmd_apply_video, 'status': cmd_status}[sys.argv[1] if len(sys.argv) > 1 else 'plan']()
