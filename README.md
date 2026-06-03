# Restaurant Content Toolkit — Lefking Enterprise

A lightweight, powerful AI toolkit designed for restaurant owners and managers to generate high-quality content in seconds.

## Features

- **🍽️ Menu Description Generator**: Create appetizing, professional dish descriptions.
- **📱 Social Media Caption Generator**: Generate ready-to-post captions with emojis and hashtags.
- **⭐ Review Reply Generator**: Respond to customer reviews professionally.
- **🤖 Multi-Model AI Support**: Primary provider **Anthropic (Claude Haiku 4.5)**, fallback to **Google (Gemini 2.5 Flash Lite)**.
- **⚙️ Admin Dashboard**: Manage access codes, track usage, and configure AI API keys.
- **☁️ Cloud Sync & Provisioning**: Securely share API keys and access codes across multiple devices.

## Getting Started

1. Open `restaurant_toolkit_v4.html` in your web browser.
2. Click **Access Tool** and enter your access code.
3. (Admins) Configure AI API keys in the Admin panel to enable direct generation.

## Multi-Device Provisioning (Cloud Sync)

To "automatically load" API keys and access codes on other devices securely:

1. **Setup**: In the Admin panel, enter a **Sync ID** (from npoint.io) and a **Sync Password**.
2. **Push**: Click **Push to Cloud**. Your data is encrypted in the browser using your password before being uploaded.
3. **Provision**: Click **Copy Provision Link**.
4. **Share**: Send this link to your other devices.
5. **Secure Load**: When the link is opened, the user will be prompted to enter the **Sync Password**. Once entered, the toolkit will automatically decrypt and load all settings and access codes.

## Security and Persistence Notice

- **Encryption**: Cloud Sync data is encrypted using **AES-GCM (256-bit)**. Your API keys are never stored in plain text on the cloud.
- **Privacy**: Provisioning links no longer include your password. You must provide the password manually on each new device.
- **LocalStorage**: By default, data is stored locally in your browser.
- **Access Control**: Administrative features are restricted to users with the 'Admin' plan.

---
© 2026 Lefking Enterprise (T) Limited · Dar es Salaam
