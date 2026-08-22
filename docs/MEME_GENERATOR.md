# BRAKE meme generator

The meme generator turns a short idea into a square campaign image while keeping the
intentionally strange BRAKE hand as its visual anchor. The first version is a free
pre-launch demo. It does not inspect a wallet or ask anyone to transfer BRAKE.

## How it works

1. The owner signs in at `/admin` and chooses **Connect OpenRouter**.
2. The server creates an S256 PKCE challenge and redirects the owner to OpenRouter.
3. OpenRouter returns a short-lived authorization code. The server exchanges that code
   and PKCE verifier for a user-controlled API key.
4. The key is written atomically to a `0600` file on the encrypted Fly Volume. It is
   never returned to the browser, committed to Git, or stored as a Fly secret.
5. The public page sends an idea and one of four styles to `POST /api/memes`. The
   server adds the campaign prompt and canonical hand reference before calling the
   OpenRouter image model.
6. The generated image returns to the browser for review, download, or sharing.

The BRAKE service does not save prompts or generated images. It keeps only in-memory
request counters, currently three generations per IP per ten minutes with two
simultaneous generations. Provider handling is governed by the selected OpenRouter
provider's own policy.

## Admin security

`/admin` requires `BRAKE_ADMIN_PASSWORD`, which should be stored as a Fly runtime
secret. This password protects access to the OAuth connection controls; it is not an
OpenRouter credential. Successful sign-in creates a one-hour, HTTP-only,
`SameSite=Lax` cookie so the top-level OpenRouter callback retains the admin session;
cross-origin API requests are still rejected. Login attempts are rate-limited.

PKCE state and verifiers live only in server memory for ten minutes and are tied to
the admin session. If the Machine restarts during OAuth, simply start the connection
again. The admin page displays only a key fingerprint and links to OpenRouter's own
settings and usage pages.

Disconnecting removes the key from BRAKE's volume but does not revoke it at
OpenRouter. Use the OpenRouter key settings link to revoke it completely.

## Local use

Copy `.env.example` to `.env`, set and export `BRAKE_ADMIN_PASSWORD`, then run:

```sh
pnpm install
pnpm dev
```

Open `http://localhost:8080/admin`. OpenRouter supports localhost callback URLs, so
the same PKCE flow works locally. Local credentials are stored under `.data`, which is
ignored by Git.

## Fly and GitHub Actions

The included `Dockerfile`, `fly.toml`, and `.github/workflows/fly.yml` deploy one
San Jose-region Machine with an encrypted one-gigabyte volume. The workflow validates
the repository first and then builds remotely on Fly, so CI does not require Docker.

One-time infrastructure setup:

```sh
fly apps create brake-coin-memes
fly volumes create brake_data --app brake-coin-memes --region sjc --size 1
fly secrets set BRAKE_ADMIN_PASSWORD --app brake-coin-memes
fly tokens create deploy --app brake-coin-memes
```

Store the resulting deploy token as the GitHub Actions repository secret
`FLY_API_TOKEN`. A push to `main`, or a manual run of the **Deploy Fly** workflow,
then runs the verified production deployment. No OpenRouter secret is needed in
GitHub or Fly.

After the first deployment, open `https://brake-coin-memes.fly.dev/admin`, sign in,
and connect OpenRouter. The public generator becomes available immediately.

The default model is `google/gemini-3.1-flash-image` (Nano Banana 2). For a slower,
premium option, set `OPENROUTER_IMAGE_MODEL=google/gemini-3-pro-image-preview` as a
non-secret Fly environment value.

## Before opening it widely

- Give the OAuth-created OpenRouter key a conservative spending limit and set account
  balance alerts.
- Replace the in-memory generation limiter with a shared store if the service grows
  beyond one Machine or becomes a serious abuse target.
- Add moderation or a review queue before automatically reposting generated images.
- Keep the generator free until there is a real token contract and a separately
  reviewed wallet-verification design. Never ask users to send tokens to an address to
  unlock a meme.
