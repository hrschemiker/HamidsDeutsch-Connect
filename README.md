<div align="center">

<img src="public/logo.png" alt="HamidsDeutsch Connect" width="100" height="100">

# HamidsDeutsch Connect

**نرم‌افزار اتصال به اینترنت آزاد برای ویندوز**

[![Platform](https://img.shields.io/badge/Windows-10%2F11%20x64-0078D4?logo=windows&logoColor=white)](https://microsoft.com/windows)
[![Electron](https://img.shields.io/badge/Electron-v42-47848F?logo=electron&logoColor=white)](https://electronjs.org)
[![sing‑box](https://img.shields.io/badge/sing--box-v1.13-FF6B35)](https://github.com/SagerNet/sing-box)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.2.0-f2c055)](../../releases/latest)

[🇬🇧 English](#english) · [⬇ دانلود آخرین نسخه](../../releases/latest)

</div>

---

## 🇮🇷 توضیحات فارسی

**HamidsDeutsch Connect** یک نرم‌افزار دسکتاپ ویندوزی است که اتصال به اینترنت آزاد را از چند روش مختلف، به شکل ساده و بدون نیاز به دانش فنی فراهم می‌کند.
هسته اصلی نرم‌افزار از موتور حرفه‌ای **sing-box** استفاده می‌کند و تمام تنظیمات پروکسی سیستم را به صورت خودکار مدیریت می‌کند — بدون اینکه چیزی روی سیستم شما باقی بماند.

---

### ✨ امکانات

| امکان | توضیح |
|-------|-------|
| 🆓 **سرور رایگان** | دریافت خودکار بهترین کانفیگ از مخازن عمومی و اتصال یک‌کلیکی |
| 🐙 **GitHub Codespace** | پروکسی خصوصی داخل GitHub — بدون نیاز به سرور شخصی |
| ☁️ **پنل BPB** | پشتیبانی کامل از BPB Panel مبتنی بر Cloudflare Workers |
| 📋 **اشتراک V2Ray** | وارد کردن لینک اشتراک و اتصال به سریع‌ترین سرور با دکمه مستقیم کنار هر سرور |
| 🔄 **اتصال مجدد هوشمند** | در صورت قطع، سرور جایگزین پیدا می‌کند و دوباره متصل می‌شود |
| 🛡️ **هسته sing-box** | موتور پروکسی با پشتیبانی از VLESS · VMess · Trojan · Shadowsocks |
| 🌐 **مدیریت خودکار Proxy** | تنظیمات پروکسی ویندوز پس از قطع اتصال به حالت اول بازمی‌گردد |
| 🔘 **دکمه توقف لحظه‌ای** | در حین اتصال، کلیک دوباره دکمه به‌فوریت اتصال را قطع می‌کند |
| 🗂️ **سینی سیستم** | بستن پنجره برنامه را به سینی سیستم کوچک می‌کند (نه خاموش) |
| 🎨 **رنگ‌بندی بهبودیافته** | طراحی تاریک با بالاترین کیفیت بصری — طلایی، فیروزه‌ای، سبز زنده |

---

### 🚀 نصب و راه‌اندازی

#### ۱. دانلود نصب‌کننده

1. از [صفحه Releases](../../releases/latest) آخرین فایل `HamidsDeutsch-Connect-Setup-x64.exe` را دانلود کنید
2. فایل نصب‌کننده را اجرا کنید
3. پس از نصب، برنامه به صورت خودکار اجرا می‌شود

---

### 📡 روش‌های اتصال

<details>
<summary><b>🆓 روش اول — سرور رایگان (آسان‌ترین روش، بدون نیاز به حساب کاربری)</b></summary>

این روش کاملاً خودکار است و نیازی به ثبت‌نام یا تنظیم ندارد.

1. برنامه را باز کنید
2. روی دکمه اصلی **«اتصال»** در صفحه اصلی کلیک کنید
3. برنامه به طور خودکار:
   - لیستی از سرورهای رایگان دریافت می‌کند
   - سرعت همه را آزمایش می‌کند
   - به سریع‌ترین سرور متصل می‌شود
4. پس از اتصال، تغییر IP در همان صفحه تأیید می‌شود

> **نکته:** اگر سرور اصلی قطع شود، برنامه به صورت خودکار سرور جدیدی پیدا می‌کند.

</details>

<details>
<summary><b>📋 روش دوم — لینک اشتراک V2Ray (پیشنهادی برای کاربران با اشتراک)</b></summary>

اگر لینک اشتراک V2Ray دارید، این روش پایدارترین اتصال را می‌دهد.

1. به تب **«اشتراک‌ها»** بروید
2. روی **«افزودن اشتراک»** کلیک کنید
3. لینک اشتراک خود را وارد کنید (معمولاً با `https://` یا `vmess://` شروع می‌شود)
4. روی **«بارگذاری»** کلیک کنید تا لیست سرورها دریافت شود
5. به تب **«سرورها»** بروید — روی دکمه **▶** کنار هر سرور کلیک کنید تا مستقیماً متصل شوید

</details>

<details>
<summary><b>🐙 روش سوم — GitHub Codespace (پروکسی خصوصی با حساب GitHub)</b></summary>

این روش یک پروکسی کاملاً خصوصی ایجاد می‌کند که فقط برای شماست.

**پیش‌نیاز:** حساب GitHub (رایگان کافی است)

#### ساخت Personal Access Token

1. وارد [github.com](https://github.com) شوید
2. از بالا-راست روی تصویر پروفایل خود کلیک کنید → **Settings**
3. از منوی چپ تا پایین بروید → **Developer settings**
4. **Personal access tokens** → **Tokens (classic)**
5. روی **Generate new token (classic)** کلیک کنید
6. یک نام دلخواه وارد کنید (مثلاً: `HamidsDeutsch`)
7. تاریخ انقضا را روی **No expiration** یا ۱ سال تنظیم کنید
8. تیک این دسترسی‌ها را بزنید:
   - ✅ `repo` — دسترسی کامل به مخازن
   - ✅ `codespace` — مدیریت Codespace
9. روی **Generate token** کلیک کنید
10. توکن را **همین‌جا کپی کنید** — دیگر نمایش داده نمی‌شود

#### اتصال در نرم‌افزار

1. به تب **«تنظیمات»** → **GitHub** بروید
2. توکن کپی‌شده را در فیلد **Personal Access Token** جای‌گذاری کنید
3. روی **«ذخیره»** کلیک کنید
4. به صفحه اصلی برگردید و روی دکمه **«اتصال از طریق GitHub»** کلیک کنید
5. اولین بار ممکن است ۲–۳ دقیقه طول بکشد (ساخت Codespace جدید)
6. پس از اتصال، IP خروجی تأیید می‌شود

> **نکته:** Codespace رایگان GitHub ماهانه ۱۲۰ ساعت استفاده دارد. برای استفاده بیشتر باید اشتراک GitHub Pro تهیه کنید.

</details>

<details>
<summary><b>☁️ روش چهارم — پنل BPB روی Cloudflare (پیشرفته)</b></summary>

BPB یک پنل پروکسی رایگان است که روی Cloudflare Workers اجرا می‌شود.

**پیش‌نیاز:** حساب Cloudflare (رایگان)

#### راه‌اندازی Cloudflare

1. در [cloudflare.com](https://cloudflare.com) ثبت‌نام کنید
2. به تب **«BPB Panel»** در نرم‌افزار بروید
3. روی **«ورود به Cloudflare»** کلیک کنید و مجوز دسترسی دهید
4. روی **«استقرار پنل BPB»** کلیک کنید
5. پس از اتمام، آدرس پنل به صورت خودکار ذخیره می‌شود
6. از تب BPB روی **«اتصال»** کلیک کنید

> **نکته:** Cloudflare Workers روزانه ۱۰۰,۰۰۰ درخواست رایگان دارد که برای استفاده معمول کافی است.

</details>

---

### ⚙️ پیش‌نیازها

- ویندوز ۱۰ یا ۱۱ (نسخه ۶۴ بیتی)
- اتصال اینترنت (برای دریافت موتور sing-box در اولین اجرا)
- حساب GitHub (فقط برای روش GitHub Codespace)
- حساب Cloudflare (فقط برای روش BPB)

---

<a name="english"></a>

---

## 🇬🇧 English

**HamidsDeutsch Connect** is a Windows desktop application that provides easy, one-click access to the free internet through multiple connection methods — with no technical knowledge required.

The core engine is **sing-box**, a professional-grade proxy runtime. All Windows proxy settings are managed automatically and fully restored when you disconnect.

---

### ✨ Features

| Feature | Description |
|---------|-------------|
| 🆓 **Free Config** | Automatically fetches and connects to the fastest free proxy server |
| 🐙 **GitHub Codespace** | Private VLESS+WebSocket proxy inside a GitHub Codespace — no personal server |
| ☁️ **BPB Panel** | Full support for BPB Panel (Cloudflare Workers-based proxy) |
| 📋 **V2Ray Subscription** | Import subscription links — connect directly from each server row with one click |
| 🔄 **Auto-Reconnect** | Automatically finds and switches to a new server if the connection drops |
| 🛡️ **sing-box Core** | Supports VLESS · VMess · Trojan · Shadowsocks · Hysteria2 and more |
| 🌐 **Windows Proxy Manager** | Proxy settings are automatically restored after disconnect |
| 🔘 **Instant Stop** | Clicking a connect button again during connection immediately aborts it |
| 🗂️ **System Tray** | Closing the window minimizes to tray instead of quitting |
| 🎨 **Premium Dark Mode** | Best-in-class visual design — vivid gold, teal, and green on deep indigo-black |

---

### 🚀 Installation

1. Download the latest `HamidsDeutsch-Connect-Setup-x64.exe` from [Releases](../../releases/latest)
2. Run the installer
3. The app launches automatically after installation

---

### 📡 Connection Methods

<details>
<summary><b>🆓 Method 1 — Free Config (Easiest, no account needed)</b></summary>

This method is fully automatic — no registration or configuration required.

1. Open the app
2. Click the main **Connect** button on the home screen
3. The app automatically:
   - Downloads a list of free proxy servers from public repositories
   - Tests latency on all servers
   - Connects to the fastest one
4. IP change is verified and shown in the app

> If the connected server drops, the app automatically reconnects to another one.

</details>

<details>
<summary><b>📋 Method 2 — V2Ray Subscription (Recommended for subscription users)</b></summary>

If you have a V2Ray subscription link, this method gives the most stable connection.

1. Go to the **Subscriptions** tab
2. Click **Add Subscription** and paste your subscription URL
3. Click **Load** to fetch the server list
4. Go to the **Servers** tab — click the **▶** button next to any server to connect directly

</details>

<details>
<summary><b>🐙 Method 3 — GitHub Codespace (Private proxy with your GitHub account)</b></summary>

This method creates a fully private proxy that only you can use.

**Requirement:** A GitHub account (free tier is sufficient)

#### Create a Personal Access Token

1. Sign in at [github.com](https://github.com)
2. Click your profile picture (top right) → **Settings**
3. Scroll to the bottom of the left sidebar → **Developer settings**
4. **Personal access tokens** → **Tokens (classic)**
5. Click **Generate new token (classic)**
6. Enter a note (e.g. `HamidsDeutsch`)
7. Set expiration to **No expiration** or 1 year
8. Check these scopes:
   - ✅ `repo` — Full control of private repositories
   - ✅ `codespace` — Manage Codespaces
9. Click **Generate token**
10. **Copy the token immediately** — it will not be shown again

#### Connect in the app

1. Go to **Settings → GitHub** in the app
2. Paste your token in the **Personal Access Token** field and save
3. Return to the home screen and click **Connect via GitHub**
4. The first connection may take 2–3 minutes (creating a new Codespace)
5. IP verification is shown after a successful connection

> GitHub Free includes 120 core-hours/month for Codespaces. Upgrade to GitHub Pro for more.

</details>

<details>
<summary><b>☁️ Method 4 — BPB Panel on Cloudflare (Advanced)</b></summary>

BPB is a free proxy panel that runs on Cloudflare Workers infrastructure.

**Requirement:** A free Cloudflare account

1. Sign up at [cloudflare.com](https://cloudflare.com)
2. Go to the **BPB Panel** tab in the app
3. Click **Login with Cloudflare** and authorize
4. Click **Deploy BPB Panel** — the app sets everything up automatically
5. Once deployed, connect and disconnect exclusively from the BPB tab

> Cloudflare Workers free tier includes 100,000 requests/day — sufficient for normal usage.

</details>

---

### 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript |
| Desktop shell | Electron v42 |
| Build tool | Vite |
| Proxy engine | sing-box v1.13 |
| Packaging | electron-builder · NSIS installer |

---

### 🛠 Development

```bash
# Install dependencies
npm install

# Start in development mode (hot reload)
npm run start

# Build Windows installer (.exe)
npm run dist:win

# Build without installer (directory output)
npm run pack:win
```

**Requirements for development:**
- Node.js 18+
- Windows 10/11 x64

---

### 📄 License

[MIT](LICENSE) — Copyright (c) 2026 HamidReza (hrschemiker). Free to use, modify, and distribute.

---

<div align="center">
  <sub>Built with care for free internet access · HamidReza 2026</sub>
</div>
