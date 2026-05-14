import fs from 'fs';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

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

/** @typedef {{ info: (s: string) => void, warn: (s: string) => void, error: (s: string) => void }} Log */

export class MachineIDResetter {
    constructor() {
        const platform = os.platform();
        if (platform === 'win32') {
            const appdata = process.env.APPDATA;
            if (!appdata) throw new Error('APPDATA is not set');
            this.configPath = path.join(appdata, 'Cursor', 'User', 'globalStorage', 'storage.json');
        } else if (platform === 'darwin') {
            this.configPath = path.join(
                os.homedir(),
                'Library',
                'Application Support',
                'Cursor',
                'User',
                'globalStorage',
                'storage.json'
            );
        } else if (platform === 'linux') {
            this.configPath = path.join(os.homedir(), '.config', 'Cursor', 'User', 'globalStorage', 'storage.json');
        } else {
            throw new Error(`Unsupported platform: ${platform}`);
        }
    }

    generateNewIds() {
        const devDeviceId = uuidv4();
        const machineId = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
        const macMachineId = crypto.createHash('sha512').update(crypto.randomBytes(64)).digest('hex');
        const sqmId = `{${uuidv4().toUpperCase()}}`;
        return {
            'telemetry.devDeviceId': devDeviceId,
            'telemetry.macMachineId': macMachineId,
            'telemetry.machineId': machineId,
            'telemetry.sqmId': sqmId,
        };
    }

    /** @param {Log} [log] */
    resetMachineIds(log) {
        const out = log || {
            info: console.log,
            warn: console.warn,
            error: console.error,
            success: console.log,
        };
        try {
            console.log();
            console.log(colorize('  → Checking configuration file...', colors.yellow));
            if (!fs.existsSync(this.configPath)) {
                console.log(colorize(`  ✗ Configuration file does not exist: ${this.configPath}`, colors.red));
                return false;
            }
            try {
                fs.accessSync(this.configPath, fs.constants.R_OK | fs.constants.W_OK);
            } catch {
                console.log(colorize(`  ✗ Cannot read/write configuration file, please check file permissions: ${this.configPath}`, colors.red));
                return false;
            }

            console.log(colorize('  ✓ Configuration file found', colors.green));
            console.log();
            console.log(colorize('  → Reading current configuration...', colors.yellow));
            const raw = fs.readFileSync(this.configPath, 'utf8');
            let config = JSON.parse(raw);

            const backupPath = `${this.configPath}.bak.${Date.now()}`;
            fs.writeFileSync(backupPath, raw, 'utf8');
            console.log(colorize(`  ✓ Backed up to: ${backupPath}`, colors.green));

            console.log();
            console.log(colorize('  → Generating new machine identifiers...', colors.yellow));
            const newIds = this.generateNewIds();
            config = { ...config, ...newIds };

            console.log(colorize('  → Saving new configuration...', colors.yellow));
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 4), 'utf8');

            console.log();
            console.log(colorize('  ✓ Machine identifiers reset successfully!', colors.bright + colors.green));
            console.log();
            for (const [key, value] of Object.entries(newIds)) {
                console.log(colorize(`  ${key}:`, colors.cyan) + ` ${value}`);
            }
            console.log();
            return true;
        } catch (e) {
            const err = /** @type {Error} */ (e);
            console.log(colorize(`  ✗ Error during reset process: ${err.message}`, colors.red));
            return false;
        }
    }
}
