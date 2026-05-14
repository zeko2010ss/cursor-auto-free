import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connect } from 'puppeteer-real-browser';
import { log } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {{
 *   headless: boolean | string,
 *   browserPath?: string,
 *   browserProxy?: string,
 *   turnstile?: boolean
 * }} opts
 */
export async function initBrowser(opts) {
    const ext = path.join(__dirname, 'turnstilePatch');
    const args = [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        //'--no-default-browser-check',
        //'--disable-dev-shm-usage',
        //'--disable-setuid-sandbox',
        //'--disable-web-security',
        //'--disable-features=IsolateOrigins,site-per-process',
    ];
    
    if (fs.existsSync(ext)) {
        const abs = path.resolve(ext);
        args.push(`--disable-extensions-except=${abs}`);
        args.push(`--load-extension=${abs}`);
    } else {
        log.warn(`Turnstile extension directory not found (optional): ${ext}`);
    }
    if (process.platform === 'darwin') {
        args.push('--no-sandbox', '--disable-gpu');
    }

    let proxy = undefined;
    if (opts.browserProxy) {
        const raw = opts.browserProxy.includes('://') ? opts.browserProxy : `http://${opts.browserProxy}`;
        try {
            const u = new URL(raw);
            proxy = {
                server: `${u.protocol}//${u.hostname}:${u.port || (u.protocol === 'https:' ? 443 : 80)}`,
            };
            if (u.username && u.password) {
                proxy.username = u.username;
                proxy.password = u.password;
            }
            log.info(`Using proxy: ${u.hostname}:${u.port || (u.protocol === 'https:' ? 443 : 80)}`);
        } catch {
            log.warn('Invalid BROWSER_PROXY, ignored');
        }
    }

    /** @type {import('chrome-launcher').LauncherOptions} */
    const customConfig = {};
    if (opts.browserPath) {
        customConfig.chromePath = opts.browserPath;
    }

    const { browser, page } = await connect({
        args,
        headless: opts.headless,
        customConfig,
        proxy,
        turnstile: opts.turnstile !== false,
        connectOption: {
            defaultViewport: null,
        },
        disableXvfb: false,
        ignoreAllFlags: false,
    });

    // puppeteer-real-browser handles user agent automatically
    // No need to set custom user agent

    return { browser, page };
}
