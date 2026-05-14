import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Match patch_cursor_get_machine_id.get_cursor_paths (Windows uses USERAPPPATH typo from upstream).
 * @returns {[string, string]} [package.json path, main.js path]
 */
export function getCursorPaths() {
    const system = process.platform;
    if (system === 'darwin') {
        const base = '/Applications/Cursor.app/Contents/Resources/app';
        return [path.join(base, 'package.json'), path.join(base, 'out/main.js')];
    }
    if (system === 'win32') {
        const base =
            process.env.USERAPPPATH ||
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Cursor', 'resources', 'app');
        if (!fs.existsSync(base)) {
            console.info('If Cursor is not in the default path, create a directory symlink as in the Python project README.');
        }
        return [path.join(base, 'package.json'), path.join(base, 'out/main.js')];
    }
    if (system === 'linux') {
        const bases = ['/opt/Cursor/resources/app', '/usr/share/cursor/resources/app'];
        for (const base of bases) {
            const pkg = path.join(base, 'package.json');
            if (fs.existsSync(pkg)) {
                return [pkg, path.join(base, 'out/main.js')];
            }
        }
        throw new Error('Cursor installation not found on Linux');
    }
    throw new Error(`Unsupported OS: ${system}`);
}

export function readCursorVersion(pkgPath) {
    const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return String(raw.version || '0.0.0');
}

function parseVersion(ver) {
    return ver.split('.').map((n) => parseInt(n, 10) || 0);
}

/** Same semantics as patch_cursor_get_machine_id.version_check(version, min_version, max_version) */
export function versionCheck(version, minVersion = '', maxVersion = '') {
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
        return false;
    }
    const cur = parseVersion(version);
    const less = (a, b) => {
        for (let i = 0; i < 3; i++) {
            if (a[i] < b[i]) return true;
            if (a[i] > b[i]) return false;
        }
        return false;
    };
    if (minVersion && less(cur, parseVersion(minVersion))) return false;
    if (maxVersion && less(parseVersion(maxVersion), cur)) return false;
    return true;
}

/** Python: check_cursor_version -> version_check(version, min_version="0.45.0") — true when Cursor >= 0.45.0 */
export function checkCursorVersionAtLeast045() {
    try {
        const [pkgPath] = getCursorPaths();
        if (!fs.existsSync(pkgPath)) return false;
        const v = readCursorVersion(pkgPath);
        return versionCheck(v, '0.45.0');
    } catch {
        return false;
    }
}
