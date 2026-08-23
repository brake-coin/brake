# STOPAI meme generator

The meme generator turns a short idea into a square campaign image while keeping the
intentionally strange STOPAI hand as its visual anchor. It never asks anyone to send
STOPAI tokens.

The idea roller always has one **Roll a meme** button. Without OpenRouter it mixes a
built-in corpus of visual styles, AI-race themes, and short messages. With OpenRouter
connected, the same button asks the visitor-funded chat model for a fresh idea. If that
request fails, it immediately falls back to the local corpus. The result appears in one
read-only text box. Its matching image format stays hidden and is selected automatically.

## BYOK flow

Every visitor brings their own OpenRouter account:

1. The browser creates a random PKCE verifier, state value, and S256 challenge.
2. **Connect with OAuth PKCE** sends the visitor to OpenRouter.
3. OpenRouter returns a short-lived authorization code to the same STOPAI page.
4. The browser checks the state value and exchanges the code plus verifier directly
   with OpenRouter for a user-controlled API key.
5. The key is kept in `sessionStorage`, which limits it to that browser tab. It is not
   sent to a STOPAI server, Fly, GitHub, or RATi.
6. The browser sends the campaign prompt and hand reference directly to OpenRouter.
   OpenRouter charges the visitor's own account and returns the image to the browser.

The code and verifier expire after ten minutes. The generated OpenRouter key remains
in the visitor's OpenRouter account until they revoke it. **Disconnect this tab**
removes the local copy; the key-settings link opens OpenRouter so the visitor can
revoke it completely.

## Privacy and costs

STOPAI does not save the visitor's key, prompt, or generated image. OpenRouter and the
selected model provider receive the prompt and STOPAI hand reference. Their own data
and billing policies apply. The interface tells visitors that image costs go directly
to their OpenRouter account.

The default model is `google/gemini-3.1-flash-image` (Nano Banana 2). The public model
is set in `config/project.json`; it is not a secret.

## Local use

Run:

```sh
pnpm install
pnpm dev
```

Open `http://localhost:8080`. OpenRouter supports localhost callback URLs, so the same
PKCE flow works locally. No admin password or OpenRouter environment variable is
needed.

## Fly and GitHub Actions

Both deployments serve the same browser-only BYOK app. Fly stores no OpenRouter key
and no longer needs a persistent volume or admin secret. The GitHub Actions deploy
token `FLY_API_TOKEN` is still needed to publish the Fly app.

The production Fly URL is `https://stopai-coin.fly.dev`.

The old shared generator endpoint returns HTTP 410 so stale clients cannot spend the
project's former key. The old owner admin page is no longer built or served.

## Before opening it widely

- Tell visitors to set a conservative OpenRouter key limit and balance alerts.
- Keep the strict content-security policy and first-party-only scripts.
- Add moderation before automatically reposting generated images.
- Never ask visitors to send tokens to unlock a meme.
