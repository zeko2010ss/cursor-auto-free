import { execSync, spawnSync } from 'child_process';
import os from 'os';

const BASE = 'https://raw.githubusercontent.com/yuaotian/go-cursor-help/refs/heads/master/scripts/run';

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

/** @param {{ info: (s: string) => void, error: (s: string) => void }} log */
export function goCursorHelp(log) {
    const system = os.platform();
    console.log();
    console.log(colorize(`  Operating System: ${system}`, colors.cyan));
    console.log();

    if (system === 'darwin') {
        const cmd =
            `curl -fsSL ${BASE}/cursor_mac_id_modifier.sh ` +
            `-o ./cursor_mac_id_modifier.sh && sudo bash ./cursor_mac_id_modifier.sh && rm ./cursor_mac_id_modifier.sh`;
        console.log(colorize('  → Executing macOS command...', colors.yellow));
        execSync(cmd, { stdio: 'inherit', shell: '/bin/bash' });
        console.log(colorize('  ✓ Machine ID reset complete', colors.green));
        return true;
    }
    if (system === 'linux') {
        const cmd = `curl -fsSL ${BASE}/cursor_linux_id_modifier.sh | sudo bash`;
        console.log(colorize('  → Executing Linux command...', colors.yellow));
        execSync(cmd, { stdio: 'inherit', shell: '/bin/bash' });
        console.log(colorize('  ✓ Machine ID reset complete', colors.green));
        return true;
    }
    if (system === 'win32') {
        const cmd = `irm ${BASE}/cursor_win_id_modifier.ps1 | iex`;
        console.log(colorize('  → Executing Windows command...', colors.yellow));
        spawnSync('powershell', ['-NoProfile', '-Command', cmd], { stdio: 'inherit', shell: true });
        console.log(colorize('  ✓ Machine ID reset complete', colors.green));
        return true;
    }
    console.log(colorize(`  ✗ Unsupported operating system: ${system}`, colors.red));
    return false;
}
