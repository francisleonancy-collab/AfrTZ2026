# Restaurant Content Toolkit — Lefking Enterprise

A lightweight, powerful AI toolkit designed for restaurant owners and managers to generate high-quality content in seconds.

## Features

- **🍽️ Menu Description Generator**: Create appetizing, professional dish descriptions.
- **📱 Social Media Caption Generator**: Generate ready-to-post captions with emojis and hashtags.
- **⭐ Review Reply Generator**: Respond to customer reviews professionally.
- **🤖 Multi-Model AI Support**: Primary provider **Anthropic (Claude Haiku 4.5)**, fallback to **Google (Gemini 2.5 Flash Lite)**.
- **⚙️ Admin Dashboard**: Manage access codes, track usage, and configure AI API keys.
- **☁️ Cloud Sync & Provisioning**: Securely share API keys and access codes across multiple devices.

## Security Architecture (No Hardcoded Secrets)

To protect your business, this version of the toolkit contains **zero hardcoded access codes** in the source code. This ensures that no one can discover your admin credentials by simply using "View Source" in their browser.

### First-Time Setup

When you first open `index.html`, you will be prompted to:
1. **Set an Admin Access Code**: This will be your master key to manage the toolkit.
2. **Set a Sync Password**: Used to encrypt your data for cloud synchronization.

Once initialized, these settings are stored securely in your browser's `localStorage` and are never exposed in the static HTML file.

## Multi-Device Provisioning (Cloud Sync)

To securely "automatically load" your configuration on other devices:

1. **Admin Panel**: Enter a **Sync ID** (get one at npoint.io) and your **Sync Password**.
2. **Push**: Click **Push to Cloud**. Your database is encrypted locally before upload.
3. **Provision**: Click **Copy Provision Link** and share it with your other devices.
4. **Initialize**: On the new device, open the link. You will be prompted for the **Sync Password**. Once entered, the device will automatically pull and decrypt your settings.

## Security and Persistence Notice

- **Zero-Knowledge Encryption**: Cloud data is encrypted using **AES-GCM (256-bit)**.
- **Private Data**: Your access codes and API keys exist only in your browser or your encrypted cloud bin.
- **Access Control**: Administrative features are strictly gated by the Admin access code you defined during setup.

---
© 2026 Lefking Enterprise (T) Limited · Dar es Salaam
