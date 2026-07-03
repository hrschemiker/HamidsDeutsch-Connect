<div dir="rtl" align="right">

<div align="center">

<img src="public/logo.png" alt="HamidsDeutsch Connect" width="100" height="100">

# HamidsDeutsch Connect

**نرم‌افزار اتصال به اینترنت آزاد برای ویندوز**

[![Platform](https://img.shields.io/badge/Windows-10%2F11%20x64-0078D4?logo=windows&logoColor=white)](https://microsoft.com/windows)
[![Electron](https://img.shields.io/badge/Electron-v42-47848F?logo=electron&logoColor=white)](https://electronjs.org)
[![sing‑box](https://img.shields.io/badge/sing--box-v1.13-FF6B35)](https://github.com/SagerNet/sing-box)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)
[![Version](https://img.shields.io/badge/Version-2.0.0-f2c055)](../../releases/latest)

[🇬🇧 English](#-english) · [⬇ دانلود آخرین نسخه](../../releases/latest)

</div>

---

## ✨ ویژگی‌ها

| روش اتصال | توضیح |
|-----------|-------|
| 📋 **اشتراک V2Ray** | وارد کردن لینک اشتراک، تست سرعت خودکار، اتصال مستقیم با یک کلیک |
| 🆓 **سرور رایگان** | دریافت خودکار بهترین کانفیگ از مخازن عمومی |
| 🐙 **GitHub Codespace** | پروکسی خصوصی داخل GitHub — بدون نیاز به سرور شخصی |
| ☁️ **پنل BPB** | پشتیبانی کامل از BPB Panel مبتنی بر Cloudflare Workers |
| 🌀 **Cloudflare WARP** | اتصال WireGuard مستقیم به شبکه Cloudflare |

| قابلیت | توضیح |
|--------|-------|
| 🔍 **اسکن خودکار IP کلودفلر** | در پس‌زمینه IP‌های تمیز CF پیدا می‌کند و برای همه اتصال‌ها اعمال می‌کند |
| 🎭 **uTLS + ECH** | انگشت‌نگاری TLS اثر انگشت Chrome/Firefox برای دور زدن DPI |
| 🔗 **پروکسی بالادستی** | زنجیر کردن به SOCKS5/HTTP موجود |
| 🔄 **اتصال مجدد هوشمند** | در صورت قطع، سرور جایگزین پیدا می‌کند |
| 🛡️ **تأیید IP** | بعد از اتصال، تغییر IP را تأیید می‌کند |
| 🌐 **مدیریت خودکار Proxy** | تنظیمات پروکسی ویندوز پس از قطع به حالت اول بازمی‌گردد |
| 🔧 **TUN Mode** | حالت شبکه‌سطح سیستم (نیاز به دسترسی مدیر) |

---

## 🚀 نصب

1. از [صفحه Releases](../../releases/latest) آخرین فایل `HamidsDeutsch-Connect-Setup-x64.exe` را دانلود کنید
2. فایل نصب‌کننده را اجرا کنید و مراحل را دنبال کنید
3. برنامه به صورت خودکار اجرا می‌شود

> برای قطع کامل فایروال برنامه باید **با دسترسی مدیر (Run as Administrator)** اجرا شود.

---

## 📡 روش‌های اتصال

<details>
<summary><b>📋 روش اول — اشتراک V2Ray (پایدارترین روش)</b></summary>

۱. به تب **«اشتراک‌ها»** بروید و لینک اشتراک خود را وارد کنید  
۲. سرورها بارگذاری می‌شوند — روی دکمه **▶** کنار هر سرور کلیک کنید  
۳. یا در صفحه اصلی روی دکمه **«اتصال به بهترین سرور»** بزنید

> برنامه به صورت خودکار بهترین IP کلودفلر را شناسایی می‌کند و برای سرورهای `workers.dev` اعمال می‌کند.

</details>

<details>
<summary><b>🆓 روش دوم — سرور رایگان (بدون نیاز به حساب کاربری)</b></summary>

در صفحه اصلی روی دکمه **«سرور رایگان»** کلیک کنید. برنامه به صورت خودکار سریع‌ترین سرور رایگان را پیدا و متصل می‌شود.

> در صورت قطع، برنامه به صورت خودکار سرور جایگزین پیدا می‌کند.

</details>

<details>
<summary><b>🌀 روش سوم — Cloudflare WARP (جدید در v2.0.0)</b></summary>

۱. به تب **«ابزارها»** بروید  
۲. در بخش **WARP** روی **«ساخت حساب WARP»** کلیک کنید (یک‌بار کافی است)  
۳. در صفحه اصلی روی دکمه **«Cloudflare WARP»** کلیک کنید

این روش یک تونل WireGuard مستقیم به شبکه Cloudflare ایجاد می‌کند و نیازی به تنظیمات اضافه ندارد.

</details>

<details>
<summary><b>🐙 روش چهارم — GitHub Codespace</b></summary>

**پیش‌نیاز:** حساب GitHub (رایگان کافی است)

#### ساخت Personal Access Token

۱. وارد [github.com](https://github.com) شوید  
۲. **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**  
۳. روی **Generate new token (classic)** کلیک کنید  
۴. تیک `repo` و `codespace` را بزنید و توکن را ذخیره کنید

#### اتصال در نرم‌افزار

۱. به تب **«تنظیمات»** → بخش **GitHub** بروید  
۲. توکن را وارد کنید و ذخیره کنید  
۳. در صفحه اصلی روی **«GitHub Codespace»** کلیک کنید

> Codespace رایگان GitHub ماهانه ۱۲۰ ساعت استفاده دارد.

</details>

<details>
<summary><b>☁️ روش پنجم — پنل BPB</b></summary>

BPB یک پنل پروکسی رایگان است که روی Cloudflare Workers اجرا می‌شود.

**پیش‌نیاز:** حساب Cloudflare (رایگان)

۱. به تب **«BPB Panel»** بروید  
۲. روی **«ورود به Cloudflare»** کلیک کنید  
۳. پس از ورود، روی **«استقرار پنل»** کلیک کنید  
۴. پس از استقرار می‌توانید مستقیماً از همین تب متصل شوید

</details>

---

## 🔧 قابلیت‌های پیشرفته

<details>
<summary><b>🔍 اسکن خودکار IP کلودفلر</b></summary>

برنامه هنگام باز شدن به صورت خودکار در پس‌زمینه IP‌های تمیز Cloudflare را اسکن می‌کند و بهترین نتیجه را ذخیره می‌کند. وقتی به سرورهای `workers.dev` یا `pages.dev` متصل می‌شوید، برنامه به صورت خودکار این IP را به جای آدرس اصلی استفاده می‌کند تا سرعت و پایداری بهتری داشته باشید.

می‌توانید از تب **«ابزارها»** اسکن دستی انجام دهید یا اسکن خودکار را غیرفعال کنید.

</details>

<details>
<summary><b>🎭 uTLS و ECH</b></summary>

از تب **«ابزارها»** می‌توانید انگشت‌نگاری TLS را برای دور زدن فیلترینگ عمیق بسته (DPI) تنظیم کنید:

- **uTLS Fingerprint:** شبیه‌سازی ترافیک Chrome، Firefox یا سایر مرورگرها
- **ECH:** رمزگذاری نام سرور در دست دادن TLS

</details>

<details>
<summary><b>🔗 پروکسی بالادستی (Upstream Proxy)</b></summary>

اگر از قبل یک پروکسی SOCKS5 یا HTTP دارید، می‌توانید از تب **«ابزارها»** آدرس آن را وارد کنید تا تمام اتصال‌های نرم‌افزار از طریق آن عبور کند.

</details>

---

## 🛠️ نیازمندی‌ها

- **ویندوز** 10 یا 11 (64 بیتی)
- **دسترسی مدیر** برای TUN Mode

---

## 📄 مجوز

این پروژه تحت [مجوز MIT](LICENSE) منتشر شده است.

</div>

---

## 🇬🇧 English

<div align="center">

<img src="public/logo.png" alt="HamidsDeutsch Connect" width="80" height="80">

**HamidsDeutsch Connect** is a Windows desktop app for free internet access, powered by [sing-box](https://github.com/SagerNet/sing-box).

</div>

### ✨ Features

| Connection Method | Description |
|-------------------|-------------|
| 📋 **V2Ray Subscription** | Import subscription links, auto latency test, one-click connect |
| 🆓 **Free Servers** | Auto-fetch best configs from public repositories |
| 🐙 **GitHub Codespace** | Private proxy inside GitHub — no VPS required |
| ☁️ **BPB Panel** | Full BPB Panel support via Cloudflare Workers |
| 🌀 **Cloudflare WARP** | WireGuard tunnel directly to Cloudflare's network |

| Feature | Description |
|---------|-------------|
| 🔍 **Auto CF IP Scan** | Background scan for clean Cloudflare IPs, auto-applied to all connections |
| 🎭 **uTLS + ECH** | TLS fingerprint mimicry (Chrome/Firefox) to bypass DPI |
| 🔗 **Upstream Proxy** | Chain through an existing SOCKS5/HTTP proxy |
| 🔄 **Smart Reconnect** | Automatically finds a replacement server on disconnect |
| 🛡️ **IP Verification** | Confirms IP change after every connection |
| 🌐 **Auto Proxy Management** | Windows proxy settings restored automatically on disconnect |
| 🔧 **TUN Mode** | System-level network routing (requires administrator) |

---

### 🚀 Installation

1. Download the latest `HamidsDeutsch-Connect-Setup-x64.exe` from [Releases](../../releases/latest)
2. Run the installer and follow the steps
3. The app launches automatically

> For complete firewall control, run the app **as Administrator**.

---

### 📡 Connection Methods

<details>
<summary><b>📋 Method 1 — V2Ray Subscription (recommended)</b></summary>

1. Go to the **Subscriptions** tab and add your subscription URL
2. Servers load automatically — click **▶** next to any server
3. Or click **Connect to Best Server** on the home screen

> The app automatically detects Cloudflare-hosted nodes (`workers.dev`) and replaces the server IP with the fastest clean CF IP from the background scan.

</details>

<details>
<summary><b>🆓 Method 2 — Free Servers (no account needed)</b></summary>

Click the **Free Server** button on the home screen. The app automatically fetches, tests, and connects to the fastest available free server.

> On disconnect, it automatically finds a replacement server.

</details>

<details>
<summary><b>🌀 Method 3 — Cloudflare WARP (new in v2.0.0)</b></summary>

1. Go to the **Tools** tab
2. Under **WARP**, click **Create WARP Account** (only needed once)
3. On the home screen, click the **Cloudflare WARP** button

This creates a WireGuard tunnel directly to Cloudflare's network with no additional configuration.

</details>

<details>
<summary><b>🐙 Method 4 — GitHub Codespace</b></summary>

**Prerequisite:** A GitHub account (free tier works)

#### Create a Personal Access Token

1. Go to [github.com](https://github.com) → **Settings** → **Developer settings** → **Personal access tokens (classic)**
2. Click **Generate new token**
3. Select `repo` and `codespace` scopes
4. Copy the token immediately (it won't be shown again)

#### Connect in the app

1. Go to **Settings** → **GitHub** section
2. Enter your token and save
3. Click **GitHub Codespace** on the home screen

> Free GitHub accounts get 120 hours/month of Codespace usage.

</details>

<details>
<summary><b>☁️ Method 5 — BPB Panel</b></summary>

BPB is a free proxy panel running on Cloudflare Workers.

**Prerequisite:** A free Cloudflare account

1. Go to the **BPB Panel** tab
2. Click **Login to Cloudflare**
3. After login, click **Deploy Panel**
4. Once deployed, connect directly from the same tab

</details>

---

### 🔧 Advanced Features

<details>
<summary><b>🔍 Auto Cloudflare IP Scan</b></summary>

On startup, the app silently scans Cloudflare IP ranges in the background and caches the fastest reachable IP. When you connect to any `workers.dev` or `pages.dev` node, this clean IP is automatically substituted as the server address while the original hostname is preserved as the TLS SNI.

You can trigger a manual scan or disable auto-scan from the **Tools** tab.

</details>

<details>
<summary><b>🎭 uTLS and ECH</b></summary>

From the **Tools** tab you can configure global TLS settings to bypass deep packet inspection (DPI):

- **uTLS Fingerprint** — mimics Chrome, Firefox, or other browser TLS handshakes
- **ECH (Encrypted ClientHello)** — encrypts the server name in the TLS handshake

</details>

<details>
<summary><b>🔗 Upstream Proxy</b></summary>

If you already have a SOCKS5 or HTTP proxy, enter it in **Tools → Upstream Proxy** and all connections will be chained through it.

</details>

---

### 🛠️ Requirements

- **Windows** 10 or 11 (64-bit)
- **Administrator** access for TUN Mode

---

### 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">
  Made with ❤️ by <a href="https://github.com/hrschemiker">Hamidreza</a>
</div>
