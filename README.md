# BRAKE

**Put the brakes on the AI race.**

BRAKE is a proposed independent memecoin project designed to direct transparent,
project-controlled creator fees toward small grants for peaceful public education and
civic action concerning the uncontrolled AI race.

The project is in **pre-launch design**. No token contract, sale, official grants
wallet, or live social-media bot exists. Any token claiming to be BRAKE is currently
unofficial.

## Simple model

- Fixed supply of 1,000,000,000 BRAKE on Solana
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
| `apps/server` | Meme-generation API and production web server |
| `apps/bot` | Social bot shell; dry-run only |
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

The local app is then available at `http://localhost:8080`. It works without secrets,
but image generation stays visibly offline until `OPENROUTER_API_KEY` is provided.

For the static site alone, use `pnpm dev:static` and open
`http://127.0.0.1:4173`.

Preview the bot without posting anything:

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

The site includes a **Send BRAKE. Get meme.** studio that combines a visitor's idea
with the canonical, intentionally weird BRAKE hand. GitHub Pages displays the studio
in offline mode; the included Node server enables generation when deployed with a
server-side OpenRouter key.

See [the meme generator guide](docs/MEME_GENERATOR.md) for the request flow, local
configuration, Fly deployment, model selection, limits, and launch precautions.

## Safety defaults

- The public configuration has no token contract or grants-wallet address.
- The token plan is locked to devnet and explicitly disables live deployment.
- The bot has no live transport; it only renders proposed messages locally.
- Secrets belong in `.env`, which is ignored by Git.
- The OpenRouter key is read only by the server and never included in browser assets.
- The repository validation rejects premature `live` status and mainnet settings.

Mainnet deployment, fundraising, custody, or live promotion requires the launch gates
in `docs/BRAKE_SIMPLE.md`, including legal review and formal RATi board approval.

## Independence and risk

BRAKE is not an official token of Stop the AI Race, Stop AI, PauseAI, RATi Open
Software Foundation, or any AI company. Buying a future BRAKE token would not be a
charitable donation and would not produce a tax receipt. A token could lose all value.

## License

No open-source license has been selected yet. Do not assume permission beyond viewing
and evaluating this pre-launch repository.
