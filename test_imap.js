import { ImapFlow } from 'imapflow';

const config = {
    imap_server: 'imap.yandex.com',
    imap_port: 993,
    imap_user: 'zeko2010ss@yandex.ru',
    imap_pass: 'oeefxcosbpcfczyp',
    imap_dir: 'INBOX'
};

const account = 'hendrix1778774980@silkroadtop100.com';

async function testImap() {
    const client = new ImapFlow({
        host: config.imap_server,
        port: config.imap_port,
        secure: true,
        auth: { user: config.imap_user, pass: config.imap_pass },
        logger: true,
    });

    try {
        await client.connect();
        console.log('Connected to IMAP');
        
        const lock = await client.getMailboxLock('INBOX');
        console.log('Mailbox locked');

        // Search TO account
        const searchResult = await client.search({ to: account });
        console.log(`Search TO "${account}": ${searchResult.length} uid(s)`);
        
        if (searchResult.length === 0) {
            console.log('No messages found, trying ALL search...');
            const allResult = await client.search({ all: true });
            console.log(`Search ALL: ${allResult.length} uid(s)`);
            
            if (allResult.length > 0) {
                // Check last 5 messages using sequence numbers
                const recent = allResult.slice(-5).reverse();
                for (const seq of recent) {
                    console.log(`\n--- Fetching sequence ${seq} ---`);
                    const msg = await client.fetchOne(seq, { envelope: true, source: true });
                    if (msg && msg.envelope) {
                        console.log('From:', msg.envelope.from?.[0]?.address);
                        console.log('To:', msg.envelope.to?.map(t => t.address).join(', '));
                        console.log('Subject:', msg.envelope.subject);
                        
                        const raw = msg.source.toString();
                        console.log('Body length:', raw.length);
                        
                        // Check if account is in message
                        if (raw.toLowerCase().includes(account.toLowerCase())) {
                            console.log('✓ Account found in message');
                        } else {
                            console.log('✗ Account NOT found in message');
                        }
                        
                        // Extract 6-digit code
                        const codeMatch = raw.match(/\b\d{6}\b/);
                        if (codeMatch) {
                            console.log('✓ Code found:', codeMatch[0]);
                        } else {
                            console.log('✗ No 6-digit code found');
                        }
                    }
                }
            }
        } else {
            // Fetch the found message using sequence number
            const seq = searchResult[0];
            console.log(`\n--- Fetching sequence ${seq} ---`);
            const msg = await client.fetchOne(seq, { envelope: true, source: true });
            if (msg && msg.envelope) {
                console.log('From:', msg.envelope.from?.[0]?.address);
                console.log('To:', msg.envelope.to?.map(t => t.address).join(', '));
                console.log('Subject:', msg.envelope.subject);
                
                const raw = msg.source.toString();
                console.log('Body length:', raw.length);
                console.log('First 500 chars:', raw.substring(0, 500));
                
                // Extract 6-digit code
                const codeMatch = raw.match(/\b\d{6}\b/);
                if (codeMatch) {
                    console.log('✓ Code found:', codeMatch[0]);
                } else {
                    console.log('✗ No 6-digit code found');
                }
            }
        }

        lock.release();
        await client.logout();
        console.log('\nDisconnected');
    } catch (error) {
        console.error('Error:', error);
        try {
            await client.logout();
        } catch {}
    }
}

testImap();
