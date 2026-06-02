# Restaurant Content Toolkit — Lefking Enterprise

A lightweight, powerful AI toolkit designed for restaurant owners and managers to generate high-quality content in seconds.

## Features

- **🍽️ Menu Description Generator**: Create appetizing, professional dish descriptions. Choose from various cuisines and tones (Warm, Upscale, Bold, Simple).
- **📱 Social Media Caption Generator**: Generate ready-to-post captions for Instagram, Facebook, WhatsApp, TikTok, and Twitter. Includes emojis and hashtags.
- **⭐ Review Reply Generator**: Respond to customer reviews professionally and humanely, protecting your restaurant's reputation.
- **🤖 Multi-Model AI Support**: Choose between Anthropic (Claude), OpenAI (ChatGPT), and Google (Gemini) as your content provider.
- **⚙️ Admin Dashboard**: Manage access codes, track usage, and monitor revenue.
- **⚙️ Settings Panel**: Securely store your AI API keys locally in your browser.

## Getting Started

1. Open `restaurant_toolkit_v4.html` in your web browser.
2. Click **Access Tool**.
3. Enter your access code to unlock the toolkit.
4. (Optional) Go to the **Settings** tab to enter your AI API keys for direct generation.
5. Select a tool from the tabs and start generating!

## Multi-Model AI and Fallback

The toolkit is designed to be flexible and resilient:
- **Direct Generation**: If you provide an API key in the Settings tab, the toolkit will attempt to generate content directly within the application using your preferred provider (Claude, GPT-4o, or Gemini 1.5 Flash).
- **Manual Fallback**: If a direct API call fails (due to browser security restrictions or lack of an API key), the toolkit provides a **"Copy Prompt"** button and direct links to **Claude.ai, ChatGPT, and Gemini**. You can copy the perfectly formatted prompt and paste it into any of these platforms to get your content in seconds.

## Security and Persistence Notice

- **Client-Side Only**: This application is entirely client-side. It does not have a backend server or database.
- **LocalStorage Persistence**: Data such as generated access codes, user sessions, and API keys are stored in your browser's `localStorage`. This means data is **unique to each device/browser** and is not synchronized across different machines.
- **Access Control**: The access control mechanism (Admin vs. User plans) is intended for UI organization and workflow management. Since the application is client-side, it should not be used for storing sensitive information or as a replacement for robust, server-side authentication.
- **API Key Safety**: Your API keys are stored locally on your device and are never sent to Lefking Enterprise or any third-party server other than the AI provider you have selected.

## Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript.
- **AI Integration**: Anthropic Claude, OpenAI GPT, Google Gemini.
- **Persistence**: LocalStorage for session, database, and settings management.

---
© 2026 Lefking Enterprise (T) Limited · Dar es Salaam
