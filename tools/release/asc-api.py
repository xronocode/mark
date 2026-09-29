#!/usr/bin/env python3
# FILE: tools/release/asc-api.py
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: C-15 T-M6 — minimal App Store Connect API client (ES256 JWT
#            via openssl, zero pip deps) for build status + metadata ops.
#   SCOPE: build list/detail for our app; extensible GETs.
#   DEPENDS: python3 stdlib + openssl; AuthKey_*.p8 in Downloads or
#            MARK_ASC_KEY path; MARK_ASC_ISSUER env; Key ID from filename.
#   LINKS: .grace/changes/active/C-15/plan.xml T-116 (ASC Phase M);
#          tools/release/asc_checklist.md; M-046 release lane.
#   ROLE: SCRIPT
#   MAP_MODE: LOCALS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   make_jwt - ES256-sign a 20-min JWT from the .p8
#   get - signed GET against api.appstoreconnect.itunes.apple.com... (v1)
#   main - default: list latest builds for com.xronocode.mark
# END_MODULE_MAP
import base64, json, os, subprocess, sys, time, urllib.request

API = "https://api.appstoreconnect.apple.com/v1"
APP_BUNDLE = "com.xronocode.mark"

def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

def make_jwt(key_path: str, key_id: str, issuer: str) -> str:
    import cryptography.hazmat.primitives.serialization as ser
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import hashes
    key = ser.load_pem_private_key(open(key_path, "rb").read(), password=None)
    if not isinstance(key, ec.EllipticCurvePrivateKey):
        raise SystemExit("not an EC key")
    header = b64u(json.dumps({"alg": "ES256", "kid": key_id, "typ": "JWT"}).encode())
    payload = b64u(json.dumps({
        "iss": issuer, "iat": int(time.time()), "exp": int(time.time()) + 1200,
        "aud": "appstoreconnect-v1"
    }).encode())
    signing = f"{header}.{payload}".encode()
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    der = key.sign(signing, ec.ECDSA(hashes.SHA256()))
    r, s_int = decode_dss_signature(der)
    raw = r.to_bytes(32, "big") + s_int.to_bytes(32, "big")
    return f"{header}.{payload}.{b64u(raw)}"

def get(path: str, jwt: str):
    req = urllib.request.Request(API + path, headers={"Authorization": f"Bearer {jwt}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def main():
    issuer = os.environ.get("MARK_ASC_ISSUER")
    if not issuer:
        sys.exit("set MARK_ASC_ISSUER=<uuid>")
    key_path = os.environ.get("MARK_ASC_KEY") or os.path.expanduser("~/Downloads/AuthKey_M665M4B6J3.p8")
    key_id = os.path.splitext(os.path.basename(key_path))[0].replace("AuthKey_", "")
    jwt = make_jwt(key_path, key_id, issuer)
    # find app by bundleId
    apps = get(f"/apps?filter[bundleId]={APP_BUNDLE}&fields[apps]=name,bundleId", jwt)
    app = apps["data"][0]
    aid = app["id"]
    builds = get(f"/apps/{aid}/builds?limit=5&fields[builds]=version,uploadedDate,processingState,usesNonExemptEncryption", jwt)
    print(f"app: {app['attributes']['name']} ({aid})")
    for b in builds["data"]:
        a = b["attributes"]
        print(f"  build {a['version']}  state={a['processingState']}  uploaded={a['uploadedDate']}  encryption={a.get('usesNonExemptEncryption')}")

if __name__ == "__main__":
    main()
