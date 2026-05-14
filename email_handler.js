import axios from 'axios';
import { ImapFlow } from 'imapflow';
import Pop3Client from 'mailpop3';
import { setTimeout as delay } from 'timers/promises';
import { getConfig } from './config.js';

/** @typedef {{ info: (s: string) => void, warn: (s: string) => void, error: (s: string) => void }} Log */

export class EmailVerificationHandler {
    /**
     * @param {string} account — registration email (same as Python `account`)
     * @param {Log} log
     */
    constructor(account, log) {
        this.account = account;
        this.log = log;
        this.cfg = getConfig();
        this.imap = this.cfg.getImap();
        this.username = this.cfg.getTempMail();
        this.epin = this.cfg.getTempMailEpin();
        this.emailExtension = this.cfg.getTempMailExt();
        this.protocol = this.cfg.getProtocol() || 'POP3';
        this.session = axios.create();
    }

    /**
     * Same contract as Python `get_verification_code` (throws after max retries).
     * @param {number} [maxRetries=5]
     * @param {number} [retryInterval=60000] ms
     */
    async getVerificationCode(maxRetries = 5, retryInterval = 60000) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            this.log.info(`Attempting to get verification code (attempt ${attempt + 1}/${maxRetries})...`);
            try {
                if (!this.imap) {
                    const [code, firstId] = await this._getLatestMailCode();
                    if (code != null && firstId != null) {
                        await this._cleanupMail(firstId);
                        return code;
                    }
                } else if (this.protocol.toUpperCase() === 'IMAP') {
                    const code = await this._getMailCodeByImap();
                    if (code) return code;
                } else {
                    const code = await this._getMailCodeByPop3();
                    if (code) return code;
                }
                if (attempt < maxRetries - 1) {
                    this.log.warn(`Verification code not received, retrying in ${retryInterval / 1000} seconds...`);
                    await delay(retryInterval);
                }
            } catch (e) {
                const err = /** @type {Error} */ (e);
                this.log.error(`Failed to get verification code: ${err.message}`);
                if (attempt < maxRetries - 1) {
                    this.log.error(`Error occurred, retrying in ${retryInterval / 1000} seconds...`);
                    await delay(retryInterval);
                } else {
                    throw new Error(`Failed to get verification code after maximum retries: ${err.message}`);
                }
            }
        }
        throw new Error(`Verification code not received after ${maxRetries} attempts.`);
    }

    async _getLatestMailCode() {
        const emailAddr = `${this.username}${this.emailExtension}`;
        const mailListUrl = `https://tempmail.plus/api/mails?email=${encodeURIComponent(emailAddr)}&limit=20&epin=${encodeURIComponent(this.epin)}`;
        const mailListResponse = await this.session.get(mailListUrl);
        await delay(500);
        const mailListData = mailListResponse.data;
        if (!mailListData?.result) return [null, null];
        const firstId = mailListData.first_id;
        if (!firstId) return [null, null];
        const mailDetailUrl = `https://tempmail.plus/api/mails/${firstId}?email=${encodeURIComponent(emailAddr)}&epin=${encodeURIComponent(this.epin)}`;
        const mailDetailResponse = await this.session.get(mailDetailUrl);
        await delay(500);
        const mailDetailData = mailDetailResponse.data;
        if (!mailDetailData?.result) return [null, null];
        const mailText = mailDetailData.text || '';
        const mailSubject = mailDetailData.subject || '';
        this.log.info(`Found email subject: ${mailSubject}`);
        const re = /(?<![a-zA-Z@.])\b\d{6}\b/;
        const codeMatch = mailText.match(re);
        if (codeMatch) return [codeMatch[0], firstId];
        return [null, null];
    }

    async _cleanupMail(firstId) {
        const emailAddr = `${this.username}${this.emailExtension}`;
        const payload = new URLSearchParams({
            email: emailAddr,
            first_id: String(firstId),
            epin: this.epin,
        }).toString();
        for (let i = 0; i < 5; i++) {
            try {
                const res = await this.session.request({
                    method: 'DELETE',
                    url: 'https://tempmail.plus/api/mails/',
                    data: payload,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                });
                if (res.data?.result === true) return true;
            } catch {
                /* ignore */
            }
            await delay(500);
        }
        return false;
    }

    /**
     * Python imaplib: non-Netease uses SEARCH TO "account" with **no UNSEEN** (read mail still matches).
     * Node previously used unseen+to, so already-read Cursor mail was never found.
     */
    _envelopeHasAccount(envelope, account) {
        if (!envelope || !account) return false;
        const want = account.toLowerCase().trim();
        const addrs = (list) => (list || []).map((a) => (a.address || '').toLowerCase());
        const inList = (list) => addrs(list).some((a) => a === want || a.includes(want) || want.includes(a));
        return inList(envelope.to) || inList(envelope.cc) || inList(envelope.bcc);
    }

    _isCursorSender(envelope) {
        const from = (envelope?.from?.[0]?.address || '').toLowerCase();
        return (
            from.includes('no-reply@cursor.sh') ||
            from.includes('noreply@cursor.com') ||
            from.includes('notify@cursor.sh')
        );
    }

    _extractSixDigitCode(raw, account) {
        let text = raw.toString();
        if (account) text = text.split(account).join('');
        let m = text.match(/\b\d{6}\b/);
        if (m) return m[0];
        // HTML-only bodies: strip tags then match (Cursor often sends multipart HTML)
        const plain = text.replace(/<[^>]+>/g, ' ');
        m = plain.match(/\b\d{6}\b/);
        return m ? m[0] : null;
    }

    /**
     * Match Python's imaplib behavior: search TO "account" only.
     * @param {import('imapflow').ImapFlow} client
     */
    async _collectCandidateUids(client) {
        try {
            const r = await client.search({ to: this.account });
            const arr = Array.isArray(r) ? r : [];
            this.log.info(`IMAP search [TO]: ${arr.length} uid(s)`);
            const list = arr.filter((u) => u > 0).map((u) => Number(u)).sort((a, b) => b - a);
            return list.slice(0, 120);
        } catch (e) {
            const err = /** @type {Error} */ (e);
            this.log.warn(`IMAP search [TO] failed: ${err.message}`);
            return [];
        }
    }

    /**
     * @param {import('imapflow').ImapFlow} client
     * @param {number[]} uids (actually sequence numbers from search)
     * @param {{ searchByDate: boolean }} ctx
     */
    async _scanUidsForCode(client, uids, ctx) {
        const sorted = [...new Set(uids)]
            .filter(Boolean)
            .map((u) => Number(u))
            .filter((u) => u > 0)
            .sort((a, b) => b - a);
        for (const seq of sorted) {
            // Use sequence number instead of UID (search returns sequence numbers)
            const msg = await client.fetchOne(seq, { envelope: true, source: true });
            if (!msg || msg === false || !msg.source) continue;
            const rawStr = msg.source.toString();
            if (ctx.searchByDate) {
                if (!this._envelopeHasAccount(msg.envelope, this.account)) continue;
            } else {
                const ok =
                    this._envelopeHasAccount(msg.envelope, this.account) ||
                    rawStr.toLowerCase().includes(this.account.toLowerCase());
                if (!ok) continue;
            }
            const code = this._extractSixDigitCode(rawStr, this.account);
            if (code) {
                // Delete using sequence number
                await client.messageFlagsAdd(seq, ['\\Deleted']);
                return code;
            }
        }
        return null;
    }

    /**
     * Last N messages by sequence (like POP3 last 10) when SEARCH TO fails on some hosts.
     * @param {import('imapflow').ImapFlow} client
     */
    async _scanRecentMailboxForCode(client) {
        const exists = client.mailbox?.exists || 0;
        if (!exists) return null;
        const n = 80;
        const start = Math.max(1, exists - n + 1);
        const range = `${start}:*`;
        for await (const msg of client.fetch(range, { source: true, envelope: true })) {
            const env = msg.envelope;
            if (!this._isCursorSender(env)) continue;
            const rawStr = msg.source.toString();
            const ok =
                this._envelopeHasAccount(env, this.account) ||
                rawStr.toLowerCase().includes(this.account.toLowerCase());
            if (!ok) continue;
            if (!msg.source) continue;
            const code = this._extractSixDigitCode(rawStr, this.account);
            if (code) {
                // Delete using sequence number from the message
                const seq = msg.seq;
                if (seq) {
                    await client.messageFlagsAdd(seq, ['\\Deleted']);
                }
                return code;
            }
        }
        return null;
    }

    /**
     * @param {number} [retry]
     */
    async _getMailCodeByImap(retry = 0) {
        if (retry > 0) await delay(3000);
        if (retry >= 20) throw new Error('Verification code retrieval timeout');
        const imap = this.imap;
        const user = imap.imap_user;
        const isNetease = ['@163.com', '@126.com', '@yeah.net'].some((s) => user.endsWith(s));
        const searchByDate = isNetease;
        const port = parseInt(String(imap.imap_port), 10) || 993;

        /** @type {import('imapflow').ImapFlowOptions} */
        const opts = {
            host: imap.imap_server,
            port,
            secure: port === 993,
            auth: { user, pass: imap.imap_pass },
            logger: false,
        };
        if (isNetease) {
            opts.id = {
                name: user.split('@')[0],
                contact: user,
                version: '1.0.0',
                vendor: 'imapflow',
            };
        }

        const client = new ImapFlow(opts);
        await client.connect();
        const mboxRaw = (imap.imap_dir || 'INBOX').trim();
        const mbox = mboxRaw.toLowerCase() === 'inbox' ? 'INBOX' : mboxRaw;
        const lock = await client.getMailboxLock(mbox);
        try {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);

            /** @type {number[]} */
            let uids = [];

            if (searchByDate) {
                const unseenOn = (await client.search({ unseen: true, on: startOfDay })) || [];
                uids = Array.isArray(unseenOn) ? unseenOn : [];
                if (uids.length === 0) {
                    const onDay = (await client.search({ on: startOfDay })) || [];
                    uids = Array.isArray(onDay) ? onDay : [];
                    this.log.warn('IMAP (Netease): no UNSEEN for today, searching all mail ON today');
                }
            } else {
                uids = await this._collectCandidateUids(client);
                this.log.info(`IMAP merged candidate UIDs: ${uids.length} (capped, newest first)`);
            }

            if (uids.length === 0) {
                this.log.warn('IMAP: no UID from search, scanning recent mailbox (last 80)');
                const fromScan = await this._scanRecentMailboxForCode(client);
                if (fromScan) return fromScan;
                return await this._getMailCodeByImap(retry + 1);
            }

            const ctx = { searchByDate };
            let code = await this._scanUidsForCode(client, uids, ctx);
            if (!code) {
                code = await this._scanRecentMailboxForCode(client);
            }
            if (code) return code;

            return await this._getMailCodeByImap(retry + 1);
        } catch (e) {
            const err = /** @type {Error} */ (e);
            this.log.error(`IMAP error: ${err.message}`);
            return null;
        } finally {
            lock.release();
            try {
                await client.logout();
            } catch {
                /* ignore */
            }
        }
    }

    /**
     * @param {number} [retry]
     */
    async _getMailCodeByPop3(retry = 0) {
        if (retry > 0) await delay(3000);
        if (retry >= 20) throw new Error('Verification code retrieval timeout');
        const imap = this.imap;
        const port = parseInt(String(imap.imap_port), 10) || 995;
        const self = this;

        return new Promise((resolve) => {
            const client = new Pop3Client(port, imap.imap_server, {
                tlserrs: false,
                enabletls: true,
                debug: false,
                user: imap.imap_user,
                pass: imap.imap_pass,
            });

            const finish = (/** @type {string | null} */ code) => {
                try {
                    client.quit();
                } catch {
                    /* ignore */
                }
                resolve(code);
            };

            client.on('connect', () => client.list());

            client.on('list', (status, msgcount) => {
                if (!status || !msgcount || msgcount <= 0) {
                    client.quit();
                    self._getMailCodeByPop3(retry + 1).then(resolve).catch(() => resolve(null));
                    return;
                }
                const low = Math.max(1, msgcount - 9);
                let current = msgcount;

                const onRetr = (retrStatus, msgid, data) => {
                    client.removeListener('retr', onRetr);
                    if (retrStatus && typeof data === 'string') {
                        const fromHdr = data.match(/From:\s*(.+)/i);
                        const fromLine = fromHdr ? fromHdr[1] : '';
                        if (fromLine.includes('no-reply@cursor.sh')) {
                            const m = data.match(/\b\d{6}\b/);
                            if (m) {
                                client.dele(msgid);
                                finish(m[0]);
                                return;
                            }
                        }
                    }
                    current -= 1;
                    if (current < low) {
                        client.quit();
                        self._getMailCodeByPop3(retry + 1).then(resolve).catch(() => resolve(null));
                        return;
                    }
                    client.on('retr', onRetr);
                    client.retr(current);
                };

                client.on('retr', onRetr);
                client.retr(current);
            });

            client.on('error', (err) => {
                self.log.error(`POP3 error: ${err.message}`);
                finish(null);
            });
        });
    }
}
