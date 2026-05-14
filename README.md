# Cursor Auto Free (Node.js Version)

![Cursor Auto Free](img/screen.png?v=1)

This is a Node.js cursor auto free using `puppeteer-real-browser` to handle browser automation and Cloudflare Turnstile verification.

## ⚠️ Educational Disclaimer

**This project is for EDUCATIONAL PURPOSES ONLY.**

- This tool is designed to demonstrate browser automation, email verification processes, and authentication workflows for learning purposes.
- **The use of this project for commercial purposes, profit-making, resale, or promotion is strictly prohibited.**
- The author is not responsible for any misuse of this software or any violations of terms of service of third-party services.
- By using this project, you agree to use it solely for educational and learning purposes.
- Do not use this tool in any way that violates the terms of service of Cursor AI or any other platform.

## Prerequisites

- Node.js (v18 or higher)
- npm or npm

## Installation

1. Clone the repository or copy the files.
2. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

Create a `.env` file in the root directory with the following variables:

```env
DOMAIN=your_domain.com
TEMP_MAIL=your_temp_email@mailto.plus
TEMP_MAIL_EPIN=your_pin
TEMP_MAIL_EXT=@mailto.plus
# Set TEMP_MAIL=null to use IMAP/POP3 mode
IMAP_SERVER=imap.yourserver.com
IMAP_PORT=993
IMAP_USER=your_email@domain.com
IMAP_PASS=your_password
IMAP_DIR=INBOX
IMAP_PROTOCOL=IMAP # or POP3
BROWSER_HEADLESS=false
BROWSER_PATH=
BROWSER_PROXY=http://username:password@proxy-server:port
```

## Usage

Run the script:
```bash
node index.js
```

## Features

- **Automated Registration**: Handles the full signup flow on cursor.com.
- **Turnstile Bypass**: Uses `puppeteer-real-browser` for seamless Cloudflare verification.
- **Email Verification**: Supports TempMail.plus API and IMAP/POP3 protocols.
- **Auth Management**: Automatically updates Cursor's local database with new session tokens.
- **Machine ID Reset**: Generates and applies new machine identifiers to prevent tracking.
