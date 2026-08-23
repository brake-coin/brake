# STOPAI ✋🏻😡

**Stop the AI race.**

STOPAI is an independent cultural memecoin and media project about stopping the
uncontrolled AI race.

The token is live on Solana mainnet. The only official mint is
`2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS`. Verify it on
[Bags](https://bags.fm/2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS) or the
[Solana explorer](https://explorer.solana.com/address/2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS).
Bags creator fees are configured to the X account
[@canadabirdie](https://x.com/canadabirdie).

## Simple model

- Fixed supply of 1,000,000,000 STOPAI on Solana
- No transfer tax, staking, yield, DAO, redemption, or holder governance
- Public creator-fee recipient: [@canadabirdie](https://x.com/canadabirdie)
- No holder claim on creator fees

The original design called for a 100% public launch with no insider allocation. The
mint account proves supply and authority status, but this repository does not yet
publish an independent wallet-distribution review.

Read the [simple design](docs/BRAKE_SIMPLE.md) and [brand guide](docs/BRAKE_BRAND.md).

## Repository map

| Path | Purpose |
| --- | --- |
| `apps/site` | Public token and transparency website |
| `apps/server` | Production web server and private admin connection |
| `apps/bot` | STOPAI Telegram chat and budgeted media bot |
| `packages/campaign` | Shared facts, disclosures, and message generation |
| `config/project.json` | Public machine-readable project status |
| `token` | Verified mainnet record, draft metadata, and historical devnet plan |
| `assets` | Canonical visual assets |
| `docs` | Design and governance documents |

## Local setup

Requirements: Node.js 22 or newer and pnpm 10.

```sh
pnpm install
pnpm check
pnpm dev
```

The local app is then available at `http://localhost:8080`. Choose **Connect with
OAuth PKCE** in the meme studio to link your own OpenRouter account for that browser
tab. No project API key is required.

For the static site alone, use `pnpm dev:static` and open
`http://127.0.0.1:4173`.

Preview the launch copy without posting anything:

```sh
pnpm bot:dry-run
```

## GitHub Pages

Pushing `main` triggers `.github/workflows/pages.yml`, which validates the repository,
builds the static site into `dist`, and deploys that artifact to GitHub Pages. The
repository's Pages source must be set to **GitHub Actions**.

All browser assets use relative URLs, so the same build works at either an account
site (`username.github.io`) or a project path (`username.github.io/brake`).

## Meme generator

The site includes a **Send $STOPAI. Get meme.** studio that combines a visitor's idea
with the canonical, intentionally weird STOPAI hand. Each visitor connects a
user-controlled OpenRouter key through S256 OAuth PKCE. Generation then runs directly
from that browser to OpenRouter.

See [the meme generator guide](docs/MEME_GENERATOR.md) for the request flow, local
configuration, Fly deployment, model selection, limits, and launch precautions.

## Telegram bot

The Telegram bot uses one shared OpenRouter connection for chat and tightly limited
server-made images and videos. The public website still uses visitor-owned BYOK keys.
The bot can also remember and resend images or videos uploaded to its chat, including
media made in the BYOK studio.

Owners connect both OpenRouter and the BotFather token through `/admin`. Both secrets
are stored as private files on the encrypted Fly volume and are never returned to the
browser.

Owners also connect the official [@STOPAICOIN](https://x.com/STOPAICOIN) account
through X OAuth PKCE in `/admin`. The bot refreshes access automatically and still
requires an operator to confirm every public post.

See [the Telegram guide](docs/TELEGRAM.md) for BotFather setup, natural-language tools, privacy,
budgets, and deployment.

## Safety defaults

- The public configuration pins one verified mainnet contract and creator-fee recipient.
- The historical token plan remains locked to devnet and cannot deploy anything.
- The bot replies only in private chats, when mentioned, or when directly replied to.
- Shared chat and media have global and per-user hourly and daily limits.
- X posting is disabled by default, operator-only, and needs a second confirmation.
- Secrets belong in `.env`, which is ignored by Git.
- Public BYOK keys stay in the visitor's browser tab. A separate admin-linked key is
  stored on the private Fly volume only for Telegram chat and limited bot media.
- Repository validation locks the public address, supply, authorities, and verification links to the mainnet record.

## Independence and risk

STOPAI is not an official token of Stop the AI Race, Stop AI, PauseAI, RATi Open
Software Foundation, or any AI company. Buying STOPAI is not a charitable donation and
does not produce a tax receipt. The token could lose all value.

## License

No open-source license has been selected yet. Do not assume permission beyond viewing
and evaluating this repository.
