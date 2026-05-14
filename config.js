import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _instance = null;

export class Config {
    constructor() {
        this.baseDir = __dirname;
        const dotenvPath = path.join(this.baseDir, '.env');
        if (!fs.existsSync(dotenvPath)) {
            throw new Error(`File ${dotenvPath} does not exist`);
        }
        dotenv.config({ path: dotenvPath });

        this.imap = false;
        const rawTemp = (process.env.TEMP_MAIL || '').trim();
        this.tempMail = rawTemp.split('@')[0];
        this.tempMailEpin = (process.env.TEMP_MAIL_EPIN || '').trim();
        this.tempMailExt = (process.env.TEMP_MAIL_EXT || '').trim();
        this.domain = (process.env.DOMAIN || '').trim();

        if (this.tempMail === 'null') {
            this.imap = true;
            this.imapServer = (process.env.IMAP_SERVER || '').trim();
            this.imapPort = (process.env.IMAP_PORT || '').trim();
            this.imapUser = (process.env.IMAP_USER || '').trim();
            this.imapPass = (process.env.IMAP_PASS || '').trim();
            this.imapDir = (process.env.IMAP_DIR || 'inbox').trim();
        }

        this.checkConfig();
    }

    getTempMail() {
        return this.tempMail;
    }

    getTempMailEpin() {
        return this.tempMailEpin;
    }

    getTempMailExt() {
        return this.tempMailExt || '@mailto.plus';
    }

    getImap() {
        if (!this.imap) return false;
        return {
            imap_server: this.imapServer,
            imap_port: this.imapPort,
            imap_user: this.imapUser,
            imap_pass: this.imapPass,
            imap_dir: this.imapDir,
        };
    }

    getDomain() {
        return this.domain;
    }

    getProtocol() {
        return (process.env.IMAP_PROTOCOL || 'POP3').trim();
    }

    checkIsValid(value) {
        return typeof value === 'string' && value.trim().length > 0;
    }

    checkConfig() {
        if (!this.checkIsValid(this.domain)) {
            throw new Error('Domain not configured, please set DOMAIN in .env file');
        }
        if (!this.imap) {
            if (!this.checkIsValid(this.tempMail)) {
                throw new Error('Temporary email not configured, please set TEMP_MAIL in .env file');
            }
        } else {
            if (!this.checkIsValid(this.imapServer)) {
                throw new Error('IMAP server not configured, please set IMAP_SERVER in .env file');
            }
            if (!this.checkIsValid(this.imapPort)) {
                throw new Error('IMAP port not configured, please set IMAP_PORT in .env file');
            }
            if (!this.checkIsValid(this.imapUser)) {
                throw new Error('IMAP username not configured, please set IMAP_USER in .env file');
            }
            if (!this.checkIsValid(this.imapPass)) {
                throw new Error('IMAP password not configured, please set IMAP_PASS in .env file');
            }
            if (this.imapDir !== 'null' && !this.checkIsValid(this.imapDir)) {
                throw new Error('IMAP inbox directory configuration invalid, please set IMAP_DIR correctly in .env file');
            }
        }
    }

    /** @param {{ info: (s: string) => void }} log */
    printConfig(log) {
        if (this.imap) {
            log.info(`IMAP server: ${this.imapServer}`);
            log.info(`IMAP port: ${this.imapPort}`);
            log.info(`IMAP username: ${this.imapUser}`);
            log.info(`IMAP password: ${'*'.repeat(this.imapPass.length)}`);
            log.info(`IMAP inbox directory: ${this.imapDir}`);
        }
        if (this.tempMail !== 'null') {
            log.info(`Temporary email: ${this.tempMail}${this.tempMailExt}`);
        }
        log.info(`Domain: ${this.domain}`);
    }

    get browserHeadless() {
        return (process.env.BROWSER_HEADLESS || 'True').toLowerCase() === 'true';
    }

    get browserPath() {
        return (process.env.BROWSER_PATH || '').trim() || undefined;
    }

    get browserProxy() {
        return (process.env.BROWSER_PROXY || '').trim() || undefined;
    }

}

export function getConfig() {
    if (!_instance) _instance = new Config();
    return _instance;
}

export function resetConfigForTests() {
    _instance = null;
}
