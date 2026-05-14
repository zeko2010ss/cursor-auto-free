import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function randomPassword(len = 12) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class EmailGenerator {
    /**
     * @param {{ info: (s: string) => void, warn: (s: string) => void }} log
     */
    constructor(log) {
        const cfg = getConfig();
        cfg.printConfig(log);
        this.domain = cfg.getDomain();
        this.names = this.loadNames(log);
        this.defaultPassword = randomPassword();
        this.defaultFirstName = this.generateRandomName();
        this.defaultLastName = this.generateRandomName();
    }

    loadNames(log) {
        const p = path.join(__dirname, 'names-dataset.txt');
        try {
            return fs.readFileSync(p, 'utf8').split(/\s+/).filter(Boolean);
        } catch {
            log.warn('names-dataset.txt file not found!');
            return [
                'John', 'Jane', 'Alex', 'Emma', 'Michael', 'Olivia', 'William', 'Sophia',
                'James', 'Isabella', 'Robert', 'Mia', 'David', 'Charlotte', 'Joseph', 'Amelia',
            ];
        }
    }

    generateRandomName() {
        return this.names[Math.floor(Math.random() * this.names.length)];
    }

    /** Mirrors Python: random.randint(0, length); timestamp slice */
    generateEmail(length = 4) {
        const sliceLen = randomInt(0, length);
        const ts = String(Math.floor(Date.now() / 1000));
        const suffix = sliceLen === 0 ? ts : ts.slice(-sliceLen);
        return `${this.defaultFirstName}${suffix}@${this.domain}`;
    }

    getAccountInfo() {
        return {
            email: this.generateEmail(),
            password: this.defaultPassword,
            first_name: this.defaultFirstName,
            last_name: this.defaultLastName,
        };
    }
}
