# Chrome Web Store listing: Verba

Copy these into the Chrome Web Store developer dashboard. Search ranking in the store comes mostly from the
**name**, **summary** and the first lines of the **description**, so the keywords are placed there on purpose.

## Name (max 75)

Verba: Hindi English Translator & AI Writing Assistant

## Summary (max 132, this is `manifest.json` "description")

Hindi to English translator, Hinglish support, smart replies and an AI assistant that reads screenshots.

## Category

Productivity (or "Tools"). Language: English (add Hindi later).

## Detailed description

Verba is a free Hindi to English translator and AI writing assistant that works right where you type: Gmail, WhatsApp Web, LinkedIn and most text boxes on the web.

TRY IT WITHOUT AN ACCOUNT
You get 5 free prompts every day with no sign-up. Create a free account when you want more.

WHAT YOU CAN DO
• Translate Hindi, Hinglish or 30+ languages into clear, natural English and insert it with one click.
• Hinglish support: understands Hindi written in English letters, and can write it too.
• Pick the tone: more natural, professional, casual, friendly or formal.
• Reply to any message: select it, click "Reply to this", and Verba drafts replies in several tones and puts one in the reply box.
• Ask AI anything: questions, emails, leave applications, cover letters, complaints, reminders. Quick-start templates help you begin.
• Paste a screenshot (Ctrl+V) and the AI reads it and answers, like a chat assistant.
• Speak instead of typing: use the microphone to dictate.
• Explain: right-click selected text for a simple explanation in the side panel.

HOW TO START
1. Click the Verba icon, or press Alt+Shift+V inside any text box.
2. Type, paste or speak your text and pick the languages.
3. Click Translate, then Insert.

PRIVACY
Your text is sent to the Verba server only when you press Translate, Ask or Reply. Verba does not read pages in the background. See the privacy policy on the Verba website.

## Keywords to keep in the text (do not stuff)

hindi to english translator, hinglish, hindi translation, english to hindi, ai writing assistant, email writer,
whatsapp reply, gmail reply, grammar, rewrite, ai assistant screenshot, voice typing

## Screenshots to upload (1280x800, 5 of them, with a one-line caption each)

1. Translate tab: Hindi → English with the five tones. Caption: "Hindi to English in one click".
2. Selection card with "Reply to this" inside WhatsApp Web. Caption: "Reply in the right tone".
3. Ask AI with a pasted screenshot and the answer. Caption: "Paste a screenshot, get an answer".
4. Ask AI quick-start templates. Caption: "Leave applications, emails, cover letters".
5. Hinglish selected in the language list. Caption: "Hinglish supported".

## Permission justifications (the review form asks for each)

| Permission | Why |
| --- | --- |
| `activeTab`, `scripting` | Read the text box or the selected text on the current tab only when the user opens Verba, and insert the result back. |
| `storage` | Save the sign-in session, language choices and settings on this device. |
| `alarms` | Refresh the user's settings and credits in the background. |
| `contextMenus`, `sidePanel` | The right-click "Explain with Verba" action and its side panel. |
| `identity` | "Continue with Google" sign-in. |
| Host permission: the Verba server | Send translation requests. |
| Host permissions: Gmail, Outlook, Yahoo Mail, Proton Mail | Let the popup that the in-page Verba button opens read and fill the message box on these sites. |
| Content script on all sites | Shows the small Verba button in webmail message boxes and reads the focused text box on request. It makes no network requests of its own. |
| Microphone (asked on a Verba page, not at install) | Voice input. |

## Single purpose statement

Verba helps people write and translate text in any text box: it translates, rewrites, explains and drafts replies, and inserts the result back into the page.

## Before each release

- Bump `version` in `public/manifest.json`.
- Build with the production addresses so the extension does not point at localhost:
  `VITE_API_URL=https://aitranslater.onrender.com VITE_DASHBOARD_URL=https://verba-trans-ai.netlify.app npm run package -w @verba/extension`
- In Google Cloud, the Web client needs this redirect URI for the published extension id:
  `https://<published-extension-id>.chromiumapp.org/`
