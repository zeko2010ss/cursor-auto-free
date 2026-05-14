import './logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from './logger.js';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { printLogo } from './logo.js';
import { getConfig } from './config.js';
import { EmailGenerator } from './email_generator.js';
import { EmailVerificationHandler } from './email_handler.js';
import { CursorAuthManager } from './auth_manager.js';
import { MachineIDResetter } from './reset_machine.js';
import { initBrowser } from './browser_manager.js';
import { exitCursor } from './exit_cursor.js';
import { goCursorHelp } from './go_cursor_help.js';
import { checkCursorVersionAtLeast045 } from './patch_cursor.js';

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const loginUrl = 'https://authenticator.cursor.sh';
const signUpUrl = 'https://authenticator.cursor.sh/sign-up';
const settingsUrl = 'https://www.cursor.com/settings';

const USAGE_SELECTOR =
    'div.col-span-2 > div > div > div > div > div:nth-child(1) > div.flex.items-center.justify-between.gap-2 > span.font-mono.text-sm\\/\\[0\\.875rem\\]';

function randomUniform(min, max) {
    return min + Math.random() * (max - min);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * WorkOS / React auth forms often ignore part of Puppeteer's `page.type()` (e.g. email stops after 1–2 chars)
 * when validation or re-renders run. Set value like a real browser + dispatch input/change.
 * If several nodes match (hidden + visible), pick the widest visible field.
 */
async function fillAuthInput(page, selector, value) {
    await page.waitForSelector(selector, { visible: true, timeout: 30000 });
    const ok = await page.evaluate(
        (sel, val) => {
            const inputs = Array.from(document.querySelectorAll(sel));
            const visible = inputs.filter((el) => {
                if (!(el instanceof HTMLInputElement) || el.disabled || el.readOnly) return false;
                const r = el.getBoundingClientRect();
                const st = window.getComputedStyle(el);
                if (st.visibility === 'hidden' || st.display === 'none' || st.opacity === '0') return false;
                return r.width > 4 && r.height > 4;
            });
            const el =
                visible.sort(
                    (a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width
                )[0] || inputs[0];
            if (!(el instanceof HTMLInputElement)) return false;
            el.focus();
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (setter) setter.call(el, val);
            else el.value = val;
            try {
                el.dispatchEvent(
                    new InputEvent('input', { bubbles: true, data: val, inputType: 'insertFromPaste' })
                );
            } catch {
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return el.value.length === val.length;
        },
        selector,
        value
    );
    if (!ok) {
        const h = await page.$(selector);
        if (h) {
            await h.click({ clickCount: 3 });
            await page.keyboard.press('Backspace');
            await h.type(value, { delay: 35 });
        }
    }
    await sleep(150 + Math.random() * 150);
}

class TurnstileError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TurnstileError';
    }
}

async function saveScreenshot(page, stage, timestamp = true) {
    try {
        const dir = path.join(__dirname, 'screenshots');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const name = timestamp ? `turnstile_${stage}_${Date.now()}.png` : `turnstile_${stage}.png`;
        const filepath = path.join(dir, name);
        await page.screenshot({ path: filepath, fullPage: true });
        log.debug(`Screenshot saved: ${filepath}`);
    } catch (e) {
        log.warn(`Failed to save screenshot: ${(e && e.message) || e}`);
    }
}

async function checkVerificationSuccess(page) {
    if (await page.$('[name="password"]')) return 'PASSWORD_PAGE';
    if (await page.$('[data-index="0"]')) return 'CAPTCHA_PAGE';
    const has = await page.evaluate(
        () => document.body && document.body.innerText && document.body.innerText.includes('Account Settings')
    );
    if (has) return 'ACCOUNT_SETTINGS';
    return null;
}

async function handleTurnstile(page, maxRetries = 2) {
    console.log(colorize('→ Detecting Turnstile verification...', colors.bright + colors.yellow));
    await saveScreenshot(page, 'start');
    let retryCount = 0;
    try {
        while (retryCount < maxRetries) {
            retryCount += 1;
            log.debug(`Attempt ${retryCount} of verification`);
            try {
                const clicked = await page.evaluate(() => {
                    const root = document.querySelector('#cf-turnstile');
                    if (!root?.shadowRoot) return false;
                    const iframe = root.shadowRoot.querySelector('iframe');
                    if (!iframe) return false;
                    try {
                        const doc = iframe.contentDocument || iframe.contentWindow?.document;
                        const input = doc?.querySelector('input[type="checkbox"], input');
                        if (input) {
                            input.click();
                            return true;
                        }
                    } catch {
                        /* cross-origin */
                    }
                    return false;
                });
                if (clicked) {
                    console.log(colorize('  ✓ Turnstile verification box detected', colors.green));
                    console.log(colorize('  → Processing...', colors.yellow));
                    await sleep(randomUniform(1000, 3000));
                    await sleep(2000);
                    await saveScreenshot(page, 'clicked');
                    const st = await checkVerificationSuccess(page);
                    if (st) {
                        console.log(colorize(`  ✓ Verification successful - Reached ${st} page`, colors.bright + colors.green));
                        console.log(colorize('  ✓ Turnstile verification passed', colors.bright + colors.green));
                        await saveScreenshot(page, 'success');
                        return true;
                    }
                }
            } catch (e) {
                log.debug(`Current attempt unsuccessful: ${(e && e.message) || e}`);
            }
            if (await checkVerificationSuccess(page)) return true;
            await sleep(randomUniform(1000, 2000));
        }
        log.error(`Verification failed - Reached maximum retry count ${maxRetries}`);
        log.error('Please visit: https://github.com/zeko2010ss/cursor-auto-free');
        await saveScreenshot(page, 'failed');
        return false;
    } catch (e) {
        const msg = `Turnstile verification process exception: ${(e && e.message) || String(e)}`;
        log.error(msg);
        await saveScreenshot(page, 'error');
        throw new TurnstileError(msg);
    }
}

async function getCursorSessionToken(page, maxAttempts = 3, retryIntervalSec = 2) {
    console.log(colorize('→ Getting session token...', colors.bright + colors.yellow));
    let attempts = 0;
    while (attempts < maxAttempts) {
        try {
            const cookies = await page.cookies();
            const c = cookies.find((x) => x.name === 'WorkosCursorSessionToken');
            if (c?.value?.includes('%3A%3A')) {
                return c.value.split('%3A%3A')[1];
            }
            attempts += 1;
            if (attempts < maxAttempts) {
                console.log(colorize(`  ⚠ Attempt ${attempts} failed, retrying in ${retryIntervalSec}s...`, colors.yellow));
                await sleep(retryIntervalSec * 1000);
            } else {
                log.error(`Reached maximum attempts (${maxAttempts}), failed to get CursorSessionToken`);
            }
        } catch (e) {
            log.error(`Failed to get cookie: ${(e && e.message) || String(e)}`);
            attempts += 1;
            if (attempts < maxAttempts) {
                log.info(`Will retry in ${retryIntervalSec} seconds...`);
                await sleep(retryIntervalSec * 1000);
            }
        }
    }
    return null;
}

function appendRegisteredUserToFile(email, password) {
    const usersPath = path.join(getConfig().baseDir, 'users.txt');
    const record = {
        registered_at: new Date().toISOString().slice(0, 19),
        email,
        password,
    };
    try {
        fs.appendFileSync(usersPath, `${JSON.stringify(record)}\n`, 'utf8');
        log.success(`Account appended to users.txt: ${usersPath}`);
    } catch (e) {
        log.warn(`Failed to write users.txt: ${(e && e.message) || String(e)}`);
    }
}

async function updateCursorAuth(email, accessToken, refreshToken) {
    const authManager = new CursorAuthManager();
    return authManager.updateAuth(email, accessToken, refreshToken);
}

function resetMachineId(newerThan045) {
    if (newerThan045) {
        goCursorHelp(log);
    } else {
        new MachineIDResetter().resetMachineIds(log);
    }
}

function printEndMessage() {
    console.log();
    console.log(colorize('='.repeat(50), colors.bright + colors.green));
    console.log(colorize('✓ All operations completed successfully!', colors.bright + colors.green));
    console.log(colorize('='.repeat(50), colors.bright + colors.green));
    console.log();
    console.log(colorize('=== Get More Information ===', colors.bright + colors.cyan));
    console.log(colorize('💬 Telegram: @zeko2010ss', colors.white));
    console.log();
    console.log(colorize('🔗 Project: https://github.com/zeko2010ss/cursor-auto-free', colors.bright + colors.blue));
    console.log(colorize('='.repeat(50), colors.bright + colors.green));
}

/**
 * @param {import('puppeteer').Page} page
 * @param {{ account: string, password: string, firstName: string, lastName: string, emailHandler: EmailVerificationHandler }} ctx
 */
async function signUpAccount(page, ctx) {
    const { account, password, firstName, lastName, emailHandler } = ctx;
    console.log(colorize('→ Visiting registration page...', colors.bright + colors.yellow));
    await page.goto(signUpUrl, { waitUntil: 'networkidle2', timeout: 120000 });

    try {
        const firstSel = 'input[name="first_name"]';
        log.info('Filling personal information...');
        await fillAuthInput(page, firstSel, firstName);
        console.log(colorize(`  ✓ First name: ${firstName}`, colors.green));
        await sleep(randomUniform(1000, 3000));

        await fillAuthInput(page, 'input[name="last_name"]', lastName);
        console.log(colorize(`  ✓ Last name: ${lastName}`, colors.green));
        await sleep(randomUniform(1000, 3000));

        await fillAuthInput(page, 'input[name="email"]', account);
        console.log(colorize(`  ✓ Email: ${account}`, colors.green));
        await sleep(randomUniform(1000, 3000));

        log.info('Submitting personal information...');
        await page.click('button[type="submit"]');
        console.log(colorize('  ✓ Personal information submitted', colors.green));
    } catch (e) {
        log.error(`Registration page access failed: ${(e && e.message) || String(e)}`);
        return false;
    }

    await handleTurnstile(page);

    try {
        console.log(colorize('→ Setting password...', colors.bright + colors.yellow));
        await fillAuthInput(page, 'input[name="password"]', password);
        await sleep(randomUniform(1000, 3000));
        log.info('Submitting password...');
        await page.click('button[type="submit"]');
        console.log(colorize('  ✓ Password submitted', colors.green));
        log.info('Waiting for system response...');
    } catch (e) {
        log.error(`Password setup failed: ${(e && e.message) || String(e)}`);
        return false;
    }

    const emailTaken = await page.evaluate(() =>
        document.body?.innerText?.includes('This email is not available.')
    );
    if (emailTaken) {
        log.error('Registration failed: Email already in use');
        return false;
    }

    await handleTurnstile(page);

    while (true) {
        try {
            if (await page.evaluate(() => document.body?.innerText?.includes('Account Settings'))) {
                log.success('Registration successful - Entered account settings page');
                break;
            }
            if (await page.$('[data-index="0"]')) {
                console.log(colorize('→ Getting email verification code...', colors.bright + colors.yellow));
        const code = await emailHandler.getVerificationCode().catch(() => null);
                if (!code) {
                    log.error('Failed to get verification code');
                    return false;
                }
                console.log(colorize(`  ✓ Verification code: ${code}`, colors.bright + colors.green));
                log.info('Inputting verification code...');
                for (let i = 0; i < code.length; i++) {
                    const sel = `input[data-index="${i}"]`;
                    await page.waitForSelector(sel, { timeout: 30000 });
                    await page.type(sel, code[i], { delay: 50 });
                    await sleep(randomUniform(100, 300));
                }
                console.log(colorize('  ✓ Verification code input complete', colors.green));
                break;
            }
        } catch (e) {
            log.error(`Verification code process error: ${(e && e.message) || String(e)}`);
        }
        await sleep(500);
    }

    await handleTurnstile(page);
    const waitTime = Math.floor(randomUniform(3, 7));
    for (let i = 0; i < waitTime; i++) {
        log.info(`Waiting for system processing... ${waitTime - i} seconds remaining`);
        await sleep(1000);
    }

    console.log(colorize('→ Getting account information...', colors.bright + colors.yellow));
    log.info('Getting account information...');
    await page.goto(settingsUrl, { waitUntil: 'networkidle2', timeout: 120000 }).catch(() => {});
    try {
        const usageEl = await page.$(USAGE_SELECTOR);
        if (usageEl) {
            const usageInfo = await usageEl.evaluate((el) => el.textContent || '');
            const parts = usageInfo.split('/');
            const totalUsage = parts[parts.length - 1]?.trim() || usageInfo.trim();
            console.log(colorize(`  ✓ Account usage limit: ${totalUsage}`, colors.green));
        }
    } catch (e) {
        log.error(`Failed to get account usage information: ${(e && e.message) || String(e)}`);
    }

    console.log(colorize('='.repeat(50), colors.bright + colors.green));
    console.log(colorize('  ✓ Registration Complete!', colors.bright + colors.green));
    console.log(colorize('='.repeat(50), colors.bright + colors.green));
    console.log(colorize('  Account Information:', colors.bright + colors.cyan));
    console.log(colorize(`  Email:    ${account}`, colors.white));
    console.log(colorize(`  Password: ${password}`, colors.white));
    appendRegisteredUserToFile(account, password);
    await sleep(5000);
    return true;
}

async function main() {
    printLogo();

    const greaterThan045 = checkCursorVersionAtLeast045();
    let browser = null;

    try {
        console.log();
        console.log(colorize('='.repeat(50), colors.bright + colors.cyan));
        console.log(colorize('  CURSOR AUTO FREE - Node.js Version', colors.bright + colors.cyan));
        console.log(colorize('='.repeat(50), colors.bright + colors.cyan));
        console.log(colorize('  💬 Telegram: @zeko2010ss', colors.bright + colors.yellow));
        console.log(colorize('='.repeat(50), colors.bright + colors.cyan));
        console.log();
        log.info('Initializing program...');
        await exitCursor(log);

        const rl = readline.createInterface({ input, output });
        try {
            console.log();
            console.log(colorize('Please select operation mode:', colors.bright + colors.yellow));
            console.log();
            console.log(colorize('  [1]', colors.bright + colors.green) + ' Reset machine code only');
            console.log(colorize('  [2]', colors.bright + colors.green) + ' Complete registration process');
            console.log();
            const line = (await rl.question(colorize('Enter your choice (1 or 2): ', colors.bright + colors.cyan))).trim();
            const choice = parseInt(line, 10);
            if (choice === 1) {
                console.log();
                console.log(colorize('→ Resetting machine code...', colors.bright + colors.yellow));
                console.log();
                resetMachineId(greaterThan045);
                log.success('Machine code reset complete');
                printEndMessage();
                await rl.question(colorize('\nPress Enter to exit...', colors.dim));
                return;
            }
            if (choice !== 2) {
                console.log();
                console.log(colorize('✗ Invalid option. Please try again.', colors.bright + colors.red));
                console.log();
                await rl.close();
                return;
            }
        } finally {
            rl.close();
        }

        console.log();
        console.log(colorize('→ Initializing browser...', colors.bright + colors.yellow));
        console.log();
        const cfg = getConfig();
        const launched = await initBrowser({
            headless: cfg.browserHeadless,
            browserPath: cfg.browserPath,
            browserProxy: cfg.browserProxy,
        });
        browser = launched.browser;
        const page = launched.page;

        await page.evaluate(() => {
            try {
                if (typeof turnstile !== 'undefined' && turnstile.reset) turnstile.reset();
            } catch {
                /* ignore */
            }
        });

        const emailGenerator = new EmailGenerator(log);
        const firstName = emailGenerator.defaultFirstName;
        const lastName = emailGenerator.defaultLastName;
        const account = emailGenerator.generateEmail();
        const password = emailGenerator.defaultPassword;

        console.log();
        console.log(colorize('='.repeat(50), colors.dim));
        console.log(colorize('  Configuration Info', colors.bright + colors.cyan));
        console.log(colorize('='.repeat(50), colors.dim));
        console.log();
        log.info('Generating random account information...');
        console.log(colorize(`  Email:    ${account}`, colors.white));
        console.log(colorize(`  Password: ${password}`, colors.white));
        console.log();

        console.log(colorize('→ Initializing email verification module...', colors.bright + colors.yellow));
        console.log();
        const emailHandler = new EmailVerificationHandler(account, log);

        console.log();
        console.log(colorize('='.repeat(50), colors.bright + colors.green));
        console.log(colorize('  Starting Registration Process', colors.bright + colors.green));
        console.log(colorize('='.repeat(50), colors.bright + colors.green));
        console.log();
        log.info(`Visiting login page: ${loginUrl}`);
        await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 120000 });

        const ok = await signUpAccount(page, {
            account,
            password,
            firstName,
            lastName,
            emailHandler,
        });

        if (ok) {
            console.log(colorize('→ Getting session token...', colors.bright + colors.yellow));
            const token = await getCursorSessionToken(page);
            if (token) {
                console.log(colorize('  ✓ Session token obtained', colors.green));
                console.log(colorize('→ Updating authentication information...', colors.bright + colors.yellow));
                await updateCursorAuth(account, token, token);
                console.log(colorize('  ✓ Authentication updated', colors.green));
                console.log(colorize('→ Resetting machine code...', colors.bright + colors.yellow));
                resetMachineId(greaterThan045);
                log.success('All operations completed');
                printEndMessage();
            } else {
                log.error('Failed to get session token, registration process incomplete');
            }
        }
    } catch (e) {
        log.error(`Program execution error: ${(e && e.message) || String(e)}`);
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch {
                /* ignore */
            }
        }
    }

    const rl = readline.createInterface({ input, output });
    try {
        console.log();
        await rl.question(colorize('Press Enter to exit...', colors.dim));
    } finally {
        rl.close();
    }
}

main();
