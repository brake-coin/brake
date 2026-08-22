# STOPAI ✋🏻😡

**Stop the AI race.**

STOPAI is a proposed independent memecoin project designed to direct transparent,
project-controlled creator fees toward small grants for peaceful public education and
civic action concerning the uncontrolled AI race.

The project is in **pre-launch design**. No token contract, sale, official grants
wallet, or live social-media bot exists. Any token claiming to be STOPAI is currently
unofficial.

## Simple model

- Fixed supply of 1,000,000,000 STOPAI on Solana
- 100% public launch; no insider allocation or presale
- No transfer tax, staking, yield, DAO, redemption, or holder governance
- 100% of project-controlled creator fees proposed for a restricted grants program
- RATi Open Software Foundation as proposed grants administrator, subject to board and
  legal approval

Read the [simple design](docs/BRAKE_SIMPLE.md) and [brand guide](docs/BRAKE_BRAND.md).

## Repository map

| Path | Purpose |
| --- | --- |
| `apps/site` | Public pre-launch and transparency website |
| `apps/server` | Production web server and private admin connection |
| `apps/bot` | STOPAI Telegram chat and budgeted media bot |
| `packages/campaign` | Shared facts, disclosures, and message generation |
| `config/project.json` | Public machine-readable project status |
| `token` | Draft metadata and devnet-only token plan |
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

Preview the campaign copy without posting anything:

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

See [the Telegram guide](docs/TELEGRAM.md) for BotFather setup, natural-language tools, privacy,
budgets, and deployment.

## Safety defaults

- The public configuration has no token contract or grants-wallet address.
- The token plan is locked to devnet and explicitly disables live deployment.
- The bot replies only in private chats, when mentioned, or when directly replied to.
- Shared chat and media have global and per-user hourly and daily limits.
- X posting is disabled by default, operator-only, and needs a second confirmation.
- Secrets belong in `.env`, which is ignored by Git.
- Public BYOK keys stay in the visitor's browser tab. A separate admin-linked key is
  stored on the private Fly volume only for Telegram chat and limited bot media.
- The repository validation rejects premature `live` status and mainnet settings.

Mainnet deployment, fundraising, custody, or live promotion requires the launch gates
in `docs/BRAKE_SIMPLE.md`, including legal review and formal RATi board approval.

## Independence and risk

STOPAI is not an official token of Stop the AI Race, Stop AI, PauseAI, RATi Open
Software Foundation, or any AI company. Buying a future STOPAI token would not be a
charitable donation and would not produce a tax receipt. A token could lose all value.

## License

No open-source license has been selected yet. Do not assume permission beyond viewing
and evaluating this pre-launch repository.
