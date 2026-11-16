#!/usr/bin/env python3
# FILE: tools/qa-pid-image.py
# START_MODULE_CONTRACT
#   PURPOSE: Read only one recorded owned macOS PID's image and stable birth token.
#   SCOPE: Typed libproc observations; no process enumeration, signals or import-time query.
#   DEPENDS: Python standard library and macOS system libproc.
#   LINKS: M-046; V-M-046; C-QA-MACOS-LAUNCH-GATE.
#   ROLE: SCRIPT
#   MAP_MODE: LOCALS
# END_MODULE_CONTRACT
# START_MODULE_MAP
#   ProcBsdInfo - Installed public 136-byte Darwin proc_bsdinfo layout.
#   Libproc - Exact PID system calls, with explicit errno and full-size checks.
#   observe_pid - Bracket image lookup with matching typed kernel birth reads.
# END_MODULE_MAP
# START_CHANGE_SUMMARY
#   - C-QA-MACOS-LAUNCH-GATE: exact PID/birth/image observation; no native acceptance inferred.
# END_CHANGE_SUMMARY
import ctypes
import errno
import json
import os
import sys


class ProcBsdInfo(ctypes.Structure):
    _fields_ = [(name, ctypes.c_uint32) for name in (
        'pbi_flags', 'pbi_status', 'pbi_xstatus', 'pbi_pid', 'pbi_ppid',
        'pbi_uid', 'pbi_gid', 'pbi_ruid', 'pbi_rgid', 'pbi_svuid', 'pbi_svgid', 'rfu_1'
    )] + [('pbi_comm', ctypes.c_char * 16), ('pbi_name', ctypes.c_char * 32)] + [
        (name, ctypes.c_uint32) for name in ('pbi_nfiles', 'pbi_pgid', 'pbi_pjobc', 'e_tdev', 'e_tpgid')
    ] + [('pbi_nice', ctypes.c_int32), ('pbi_start_tvsec', ctypes.c_uint64), ('pbi_start_tvusec', ctypes.c_uint64)]


class Libproc:
    def __init__(self):
        self.lib = ctypes.CDLL('/usr/lib/libproc.dylib', use_errno=True)
        self.lib.proc_pidinfo.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_uint64, ctypes.c_void_p, ctypes.c_int]
        self.lib.proc_pidinfo.restype = ctypes.c_int
        self.lib.proc_pidpath.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32]
        self.lib.proc_pidpath.restype = ctypes.c_int

    def birth(self, pid):
        value = ProcBsdInfo()
        ctypes.set_errno(0)
        count = self.lib.proc_pidinfo(pid, 3, 0, ctypes.byref(value), ctypes.sizeof(value))
        if count <= 0:
            raise OSError(ctypes.get_errno(), 'pidinfo')
        return {'size': count, 'pid': value.pbi_pid, 'seconds': value.pbi_start_tvsec,
                'microseconds': value.pbi_start_tvusec}

    def path(self, pid):
        value = ctypes.create_string_buffer(4096)
        ctypes.set_errno(0)
        count = self.lib.proc_pidpath(pid, value, len(value))
        if count <= 0:
            raise OSError(ctypes.get_errno(), 'pidpath')
        if count > len(value) or b'\0' not in value.raw:
            raise ValueError('path-size')
        return os.fsdecode(value.value)


def observe_pid(pid, backend=None):
    """Injected backend is an import-only testing seam, never a CLI/env option."""
    if type(pid) is not int or not 0 < pid <= 2147483647:
        return {'status': 'unknown', 'reason': 'pid', 'pid': None}
    try:
        if backend is None:
            if sys.platform != 'darwin':
                return {'status': 'unknown', 'reason': 'unsupported-platform', 'pid': pid}
            backend = Libproc()
        if ctypes.sizeof(ProcBsdInfo) != 136 or ProcBsdInfo.pbi_start_tvsec.offset != 120:
            raise ValueError('abi')

        def checked(value):
            if not isinstance(value, dict) or value.get('size') != 136 or type(value.get('pid')) is not int or value['pid'] != pid:
                raise ValueError('pidinfo-size-or-identity')
            seconds, micros = value.get('seconds'), value.get('microseconds')
            if type(seconds) is not int or not 0 < seconds <= 18446744073709551615 or type(micros) is not int or not 0 <= micros <= 999999:
                raise ValueError('birth')
            return {'seconds': str(seconds), 'microseconds': str(micros)}

        before = checked(backend.birth(pid))
        path = backend.path(pid)
        after = checked(backend.birth(pid))
        if before != after:
            raise ValueError('birth-changed')
        if type(path) is not str or not path.startswith('/') or '\0' in path:
            raise ValueError('image')
        return {'status': 'present', 'pid': pid, 'executablePath': path, 'birth': before}
    except OSError as error:
        return {'status': 'absent' if error.errno == errno.ESRCH else 'unknown', 'pid': pid,
                'reason': 'ESRCH' if error.errno == errno.ESRCH else 'system-query', 'errno': error.errno}
    except (ValueError, TypeError, AttributeError):
        return {'status': 'unknown', 'reason': 'invalid-observation', 'pid': pid}


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] != '--pid' or not sys.argv[2].isascii() or not sys.argv[2].isdigit() or sys.argv[2].startswith('0'):
        raise SystemExit(2)
    print(json.dumps(observe_pid(int(sys.argv[2])), separators=(',', ':')))
