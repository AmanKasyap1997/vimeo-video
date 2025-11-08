# Media Simplified – One-File Screen Recorder

Front-end + back-end in **one Node file**. Records screen+mic in the browser, uploads to Vimeo (TUS), names the video, then saves the link to GHL and posts a Note to the conversation.

## Quick start

```bash
npm i
# set env vars (see .env.example), then
node server.js
```

Open:
```
http://localhost:3000/?contactId={{contact.id}}&conversationId={{conversation.id}}&name={{contact.full_name}}
```

## Env vars

See `.env.example` for all keys you must provide. Never commit real keys.
