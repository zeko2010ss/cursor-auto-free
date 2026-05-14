import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.join(__dirname, 'logs');

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
};

function colorize(text, color) {
    return `${color}${text}${colors.reset}`;
}

function printSeparator(char = '=', length = 50) {
    console.log(colorize(char.repeat(length), colors.dim));
}

function printHeader(text) {
    printSeparator();
    console.log(colorize(text, colors.bright + colors.cyan));
    printSeparator();
}

function printSection(text) {
    console.log(colorize(`\n${text}`, colors.bright + colors.blue));
}

function fileLine(level, message) {
    const line = `${stamp()} - ${level} - ${message}\n`;
    const file = path.join(logDir, `${stamp().slice(0, 10)}.log`);
    fs.appendFileSync(file, line, 'utf8');
}

function prefixDebug(msg) {
    return `[Open source project: https://github.com/zeko2010ss/cursor-auto-free] ${msg}`;
}

export const log = {
    /** @param {string} msg */
    info(msg) {
        fileLine('INFO', msg);
        console.log(colorize(`[INFO] ${msg}`, colors.green));
    },
    /** @param {string} msg */
    warn(msg) {
        fileLine('WARNING', msg);
        console.warn(colorize(`[WARN] ${msg}`, colors.yellow));
    },
    /** @param {string} msg */
    error(msg) {
        fileLine('ERROR', msg);
        console.error(colorize(`[ERROR] ${msg}`, colors.red));
    },
    /** @param {string} msg */
    debug(msg) {
        fileLine('DEBUG', prefixDebug(msg));
        console.log(colorize(`[DEBUG] ${prefixDebug(msg)}`, colors.cyan));
    },
    /** @param {string} msg */
    success(msg) {
        fileLine('SUCCESS', msg);
        console.log(colorize(`[SUCCESS] ${msg}`, colors.bright + colors.green));
    },
};

log.info(`Logger initialized, log directory: ${path.resolve(logDir)}`);
