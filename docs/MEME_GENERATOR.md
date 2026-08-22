# BRAKE meme generator

The meme generator turns a short idea into a square campaign image while keeping the
intentionally strange BRAKE hand as its visual anchor. The first version is a free
pre-launch demo. It does not inspect a wallet or ask anyone to transfer BRAKE.

## How it works

1. The public page sends an idea and one of four style choices to `POST /api/memes`.
2. The Fly service adds the campaign prompt and canonical hand reference image.
3. The service asks an OpenRouter image model for a 1:1 image.
4. The generated image returns to the browser for review, download, or sharing.

The API key remains a Fly secret. The BRAKE service does not save prompts or generated
images. It keeps only an in-memory request counter, currently three requests per IP per
ten minutes, and permits two simultaneous generations. Provider handling is governed
by the selected OpenRouter provider's own policy.

## Local use

Copy `.env.example` to `.env`, set `OPENROUTER_API_KEY`, export those values into the
shell, then run:

```sh
pnpm install
pnpm dev
```

The server listens at `http://localhost:8080`. Without a key, the site still renders
and clearly shows that generation is offline.

## Fly deployment

The included `Dockerfile` and `fly.toml` are ready for a Seattle-region Fly app. Before
the first deploy, confirm that the proposed app name is available and authenticate the
Fly CLI. Store the OpenRouter credential as a secret rather than in `fly.toml`:

```sh
fly apps create brake-coin-memes
fly secrets set OPENROUTER_API_KEY
fly deploy
```

If the app name changes, update `app`, `PUBLIC_APP_URL`, `OPENROUTER_SITE_URL`, and
`ALLOWED_ORIGINS` together in `fly.toml`.

The default model is `google/gemini-3.1-flash-image` (Nano Banana 2). For a slower,
premium option, set `OPENROUTER_IMAGE_MODEL=google/gemini-3-pro-image-preview` as a Fly
secret or non-secret environment value.

## Before opening it widely

- Put a hard monthly spending limit and low-balance alerts on the OpenRouter account.
- Replace the in-memory limiter with a shared store if the service grows beyond one
  Machine or becomes a serious abuse target.
- Add moderation or a review queue before automatically reposting generated images.
- Keep the generator free until there is a real token contract and a separately
  reviewed wallet-verification design. Never ask users to send tokens to an address to
  unlock a meme.
