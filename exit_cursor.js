import { execSync, spawnSync } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
};

function colorize(text, color) {
    return `${color}${text}${colors.reset}`;
}

function isCursorRunningWin() {
    try {
        const out = execSync('tasklist /FI "IMAGENAME eq Cursor.exe"', { encoding: 'utf8' });
        return out.toLowerCase().includes('cursor.exe');
    } catch {
        return false;
    }
}

function isCursorRunningUnix() {
    const r = spawnSync('pgrep', ['-i', 'cursor'], { encoding: 'utf8' });
    return r.status === 0 && (r.stdout || '').trim().length > 0;
}

function requestTerminate() {
    if (process.platform === 'win32') {
        spawnSync(
            'powershell',
            [
                '-NoProfile',
                '-Command',
                'Get-Process -Name "Cursor" -ErrorAction SilentlyContinue | Stop-Process -ErrorAction SilentlyContinue',
            ],
            { stdio: 'ignore' }
        );
    } else {
        spawnSync('pkill', ['-TERM', '-i', 'cursor'], { stdio: 'ignore' });
    }
}

/**
 * Gracefully stop Cursor (same intent as exit_cursor.py).
 * @param {{ info: (s: string) => void, warn: (s: string) => void, error: (s: string) => void }} log
 */
export async function exitCursor(log, timeoutMs = 5000) {
    console.log();
    console.log(colorize('  → Checking for running Cursor processes...', colors.yellow));
    try {
        const running =
            process.platform === 'win32' ? isCursorRunningWin() : isCursorRunningUnix();
        if (!running) {
            console.log(colorize('  ✓ No running Cursor process found', colors.green));
            return true;
        }
        console.log(colorize('  → Stopping Cursor processes...', colors.yellow));
        requestTerminate();
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const still =
                process.platform === 'win32' ? isCursorRunningWin() : isCursorRunningUnix();
            if (!still) {
                console.log(colorize('  ✓ All Cursor processes closed successfully', colors.bright + colors.green));
                return true;
            }
            await delay(500);
        }
        console.log(colorize('  ⚠ Some Cursor processes did not close within the specified time', colors.yellow));
        return false;
    } catch (e) {
        console.log(colorize(`  ✗ Error occurred while closing Cursor process: ${(e && e.message) || e}`, colors.red));
        return false;
    }
}
