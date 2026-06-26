<div align="center">

<img src="assets/icon.png" alt="HamidsDeutsch Connect" width="80" height="80" onerror="this.style.display='none'">

# HamidsDeutsch Connect

**برنامه دسکتاپ VPN برای ویندوز — سریع، امن و رایگان**

[![Windows](https://img.shields.io/badge/Windows-10%2F11-0078D4?logo=windows&logoColor=white)](https://www.microsoft.com/windows)
[![Electron](https://img.shields.io/badge/Electron-v32-47848F?logo=electron&logoColor=white)](https://www.electronjs.org)
[![sing-box](https://img.shields.io/badge/sing--box-v1.13-FF6B35)](https://github.com/SagerNet/sing-box)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](LICENSE)

[🇬🇧 English Description](#english-description) | [⬇ دانلود](#نصب-و-راه‌اندازی)

</div>

---

## توضیحات فارسی

**HamidsDeutsch Connect** یک برنامه دسکتاپ ویندوزی است که دسترسی به اینترنت آزاد را با چند روش مختلف، به صورت ساده و یک‌کلیکی فراهم می‌کند.

### ✨ قابلیت‌های اصلی

| قابلیت | توضیح |
|--------|-------|
| 🆓 **سرور رایگان** | دریافت خودکار بهترین کانفیگ از مخازن عمومی و اتصال به سریع‌ترین سرور |
| 🐙 **GitHub Codespace** | اتصال از طریق یک پروکسی خصوصی داخل GitHub — بدون سرور شخصی |
| ☁️ **BPB Panel** | پشتیبانی کامل از پنل BPB مبتنی بر Cloudflare Workers |
| 📋 **اشتراک** | وارد کردن لینک اشتراک V2Ray و اتصال خودکار به سریع‌ترین سرور |
| 🔄 **اتصال مجدد خودکار** | در صورت قطع ناخواسته، سرور جدید را پیدا و دوباره متصل می‌شود |
| 🛡️ **هسته sing-box** | موتور پروکسی حرفه‌ای با پشتیبانی از VLESS، VMess، Trojan و ... |
| 🌐 **مدیریت خودکار Proxy ویندوز** | بدون نیاز به تنظیم دستی؛ پس از قطع اتصال، تنظیمات پروکسی به حالت قبل بازمی‌گردد |
| 🇮🇷 / 🇬🇧 / 🇩🇪 **سه‌زبانه** | رابط کاربری به فارسی (RTL)، انگلیسی و آلمانی |

### نصب و راه‌اندازی

#### روش اول — دانلود نصب‌کننده

1. آخرین نسخه را از [Releases](../../releases) دانلود کنید.
2. فایل `HamidsDeutsch-Connect-Setup.exe` را اجرا کنید.
3. پس از نصب، برنامه را باز کرده و روش اتصال دلخواه را انتخاب کنید.

#### روش دوم — اتصال سریع با سرور رایگان

1. برنامه را باز کنید.
2. روی دکمه **Get Free Config** در صفحه اصلی کلیک کنید.
3. برنامه به طور خودکار بهترین سرور را پیدا کرده و متصل می‌شود.

#### روش سوم — اتصال از طریق GitHub

برای کاربرانی که حساب GitHub دارند، این روش امنیت بیشتری فراهم می‌کند:

1. به **Settings → GitHub** بروید.
2. یک Personal Access Token با دسترسی `codespace` و `repo` وارد کنید.
3. روی دکمه **اتصال از طریق GitHub Codespace** کلیک کنید.

### پیش‌نیازها

- ویندوز ۱۰ یا ۱۱ (x64)
- اتصال اینترنت (برای دریافت موتور sing-box در اولین اجرا)

---

<a name="english-description"></a>

## English Description

**HamidsDeutsch Connect** is a Windows desktop VPN client that provides easy, one-click access to the free internet through multiple connection methods.

### ✨ Features

| Feature | Description |
|---------|-------------|
| 🆓 **Free Config** | Automatically fetches and connects to the fastest free proxy from public repositories |
| 🐙 **GitHub Codespace** | Private VLESS+WebSocket proxy inside a GitHub Codespace — no personal server needed |
| ☁️ **BPB Panel** | Full support for BPB Panel (Cloudflare Workers-based proxy) |
| 📋 **Subscriptions** | Import V2Ray subscription links and auto-connect to the fastest server |
| 🔄 **Auto-Reconnect** | Automatically finds and connects to a new server if the connection drops |
| 🛡️ **sing-box Core** | Professional proxy engine supporting VLESS, VMess, Trojan, Shadowsocks and more |
| 🌐 **Windows Proxy Management** | No manual proxy settings needed; automatically restores proxy state on disconnect |
| 🇮🇷 / 🇬🇧 / 🇩🇪 **Trilingual** | Full UI in Persian (RTL), English, and German |

### Installation

#### Option 1 — Installer

1. Download the latest release from [Releases](../../releases).
2. Run `HamidsDeutsch-Connect-Setup.exe`.
3. Open the app and choose a connection method.

#### Option 2 — Free Config (Quick Start)

1. Open the app.
2. Click **Get Free Config** on the home screen.
3. The app automatically finds and connects to the fastest available server.

#### Option 3 — GitHub Codespace

1. Go to **Settings → GitHub** and enter a Personal Access Token with `codespace` and `repo` scopes.
2. Click **Connect via GitHub Codespace** on the home screen.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript |
| Desktop | Electron |
| Bundler | Vite |
| Proxy Core | sing-box v1.13 |
| Packaging | electron-builder (NSIS installer) |

### Development

```bash
# Install dependencies
npm install

# Development mode (Vite + Electron hot-reload)
npm run start

# Build Windows installer
npm run dist:win

# Build without installer (directory output)
npm run pack:win
```

### Requirements

- Windows 10/11 x64
- Node.js 18+ (for development only)
- Internet connection (to download sing-box engine on first run)

### License

[MIT](LICENSE)

---

<div align="center">
  <sub>Built with ❤️ for free internet access</sub>
</div>
