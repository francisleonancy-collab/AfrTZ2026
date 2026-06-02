# Restaurant Content Toolkit — Lefking Enterprise

A lightweight, powerful AI toolkit designed for restaurant owners and managers to generate high-quality content in seconds.

## Features

- **🍽️ Menu Description Generator**: Create appetizing, professional dish descriptions. Choose from various cuisines and tones (Warm, Upscale, Bold, Simple).
- **📱 Social Media Caption Generator**: Generate ready-to-post captions for Instagram, Facebook, WhatsApp, TikTok, and Twitter. Includes emojis and hashtags.
- **⭐ Review Reply Generator**: Respond to customer reviews professionally and humanely, protecting your restaurant's reputation.
- **🤖 Multi-Model AI Support**: Choose between Anthropic (Claude), OpenAI (ChatGPT), and Google (Gemini) as your content provider.
- **⚙️ Admin Dashboard**: Manage access codes, track usage, monitor revenue, and configure AI API keys.

## Getting Started

1. Open `restaurant_toolkit_v4.html` in your web browser.
2. Click **Access Tool**.
3. Enter your access code to unlock the toolkit.
4. Select a tool from the tabs and start generating!

## Multi-Model AI and Fallback

The toolkit is designed to be flexible and resilient:
- **Direct Generation**: For Admins, the toolkit can be configured with API keys in the Admin panel. It will attempt to generate content directly using the preferred provider (Claude, GPT-4o, or Gemini 1.5 Flash).
- **Automatic Fallback**: If the preferred AI provider fails, the system automatically attempts to use other configured providers in a loop.
- **Error Handling**: If all AI options fail, regular users are directed to contact support for assistance. Admins retain access to a manual fallback (Copy Prompt and direct AI links) to facilitate troubleshooting.

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
