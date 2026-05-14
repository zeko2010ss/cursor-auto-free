import sqlite3 from 'sqlite3';
import os from 'os';
import path from 'path';
import fs from 'fs';

class CursorAuthManager {
    constructor() {
        const platform = os.platform();
        if (platform === 'win32') {
            const appdata = process.env.APPDATA;
            if (!appdata) throw new Error('APPDATA is not set');
            this.dbPath = path.join(appdata, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
        } else if (platform === 'darwin') {
            this.dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
        } else if (platform === 'linux') {
            this.dbPath = path.join(os.homedir(), '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
        } else {
            throw new Error(`Unsupported platform: ${platform}`);
        }
    }

    async updateAuth(email, accessToken, refreshToken) {
        if (!fs.existsSync(this.dbPath)) {
            console.error(`Database not found: ${this.dbPath}`);
            return false;
        }

        const updates = [
            ['cursorAuth/cachedSignUpType', 'Auth_0']
        ];

        if (email) updates.push(['cursorAuth/cachedEmail', email]);
        if (accessToken) updates.push(['cursorAuth/accessToken', accessToken]);
        if (refreshToken) updates.push(['cursorAuth/refreshToken', refreshToken]);

        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) return reject(err);
            });

            db.serialize(() => {
                const stmt = db.prepare("INSERT OR REPLACE INTO itemTable (key, value) VALUES (?, ?)");
                for (const [key, value] of updates) {
                    stmt.run(key, value, (err) => {
                        if (err) console.error(`Error updating ${key}:`, err.message);
                        else console.log(`Successfully updated ${key.split('/').pop()}`);
                    });
                }
                stmt.finalize((err) => {
                    db.close();
                    if (err) reject(err);
                    else resolve(true);
                });
            });
        });
    }
}

export { CursorAuthManager };
