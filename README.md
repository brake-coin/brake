# STOPAI ✋🏻😡

**Stop the AI race.**

STOPAI is an independent cultural memecoin and media project about stopping the
uncontrolled AI race.

The token is live on Solana mainnet. The only official mint is
`2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS`. Verify it on
[Bags](https://bags.fm/2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS) or the
[Solana explorer](https://explorer.solana.com/address/2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS).
Bags shows the X account [@canadabirdie](https://x.com/canadabirdie) with a 100%
share of the STOPAI creator-fee distribution. This means 100% of Bags creator
fees, not 100% of all trading or protocol fees.

## Simple model

- Fixed supply of 1,000,000,000 STOPAI on Solana
- No transfer tax, staking, yield, DAO, redemption, or holder governance
- Public creator-fee recipient: [@canadabirdie](https://x.com/canadabirdie), 100% share
- No holder claim on creator fees

The original design called for a 100% public launch with no insider allocation. The
mint page now publishes an automated snapshot of the 20 largest token accounts and a
small sample of recent flows involving the five largest accounts. This is useful for
monitoring, but it is not a full holder history or an independent distribution audit.

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

## Token monitor

The official mint page reads confirmed Solana data through the server. It shows live
supply, concentration across the largest token accounts, their owner addresses, and
recent net balance movement found in a small sample. Results are cached for five
minutes to protect the RPC service. Set `SOLANA_RPC_URL` to a trusted Solana mainnet RPC
endpoint in production, or set the private `HELIUS_API_KEY` secret. A full RPC URL takes
priority over Helius, and the public Solana endpoint is the final fallback. Never put a
real provider key in source control or browser code.

The monitor does not guess whether an owner address is a person, program, exchange, or
liquidity system. It also does not claim to cover every holder or transfer. In complex
multi-party transactions, the displayed route is inferred by matching net balance
decreases to net increases and may not describe each instruction inside the transaction.

Generate a dated fair-launch, holder-distribution, and token-history report with a
private Helius key:

```sh
HELIUS_API_KEY=your_private_key pnpm token:report
```

The report and its machine-readable snapshot are written to `reports/`. The key is read
from the environment and is never written into either output.

## Telegram bot

The Telegram bot uses one shared OpenRouter connection for chat and bounded server-made
images, stickers, and videos. Stickers are cut into transparent Telegram-ready PNGs and
added to one shared bot pack. They use the same generation budget as images. The public
website still uses visitor-owned BYOK keys.
The bot can also remember and resend images, stickers, or videos uploaded to its chat, including
media made in the BYOK studio.

Owners connect both OpenRouter and the BotFather token through `/admin`. Both secrets
are stored as private files on the encrypted Fly volume and are never returned to the
browser.

Owners also connect the official [@STOPAICOIN](https://x.com/STOPAICOIN) account
through X OAuth PKCE in `/admin`. The bot refreshes access automatically. Its persistent
campaign agent researches watched X accounts, recent X searches, and AI news; compares new
items with durable goals and memories; may skip weak cycles; and keeps source links on
bounded autonomous posts from the official account.

Public automation also needs X's account-level setup: an Automated profile label, clear
operator disclosure and contact in the bio, a linked human-managed account, and any
required approval for AI-generated posting.

See [the Telegram guide](docs/TELEGRAM.md) for BotFather setup, natural-language tools, privacy,
budgets, and deployment.

The Telegram agent can also read individual X posts, search the last seven days of public
posts, and inspect a public account's recent originals. It can turn an @canadabirdie post
into a new STOPAI meme and publish it with the original post URL visibly attached.

## Safety defaults

- The public configuration pins one verified mainnet contract and creator-fee recipient.
- The historical token plan remains locked to devnet and cannot deploy anything.
- The bot uses AI only in the one group configured by `TELEGRAM_ALLOWED_CHAT_ID`, and only
  when its full username is mentioned or its message is directly replied to. Other groups
  are ignored. DMs receive a random gallery meme and the group link without reaching the
  agent.
- Telegram topic history is separated and member turns are labelled. Chat text expires
  after 30 days. Only actionable updates enter the bounded duplicate ledger; safe event logs
  explain why other traffic was ignored without storing message text or raw IDs.
- Shared chat and media have global and per-user hourly and daily limits.
- X research has separate global and per-user hourly and daily limits.
- Telegram users may propose X posts, but the agent is the editor and no request forces a
  generation or publication. It may decline spam, repetition, weak ideas, bad timing, or a
  poor use of shared capacity. A one-hour account cooldown,
  a four-hour per-user cooldown, and caps of 20 manual posts per hour and 80 per day prevent bursts.
- X publishes require a read-after-write receipt from `@STOPAICOIN`. X post links in bot
  replies must come from the conversation or a tool result; the bot does not scan wording.
- Media posts still receive alt text. The Telegram agent writes it from the saved visual
  brief, provenance, caption, and conversation; the server supplies an honest fallback.
  No fixed user confirmation phrase or user-written alt-text form is required.
- X posts are top-level only, contain no unsolicited @mentions, and cannot quote replies,
  reposts, quote-posts, sensitive posts, or @STOPAICOIN itself. A durable atomic source ledger prevents the
  same X post from being used twice, including across restarts and concurrent requests. The one narrow
  mention exception is a guarded fee-route disclosure that names @canadabirdie and includes the 100%
  creator-fee share, no-affiliation, and no-holder-claim facts together.
- The persistent campaign agent checks its timer before spending research/model budget,
  researches every two hours when eligible, remembers used sources and
  past posts, uses sources no older than seven days, waits at least four hours after any
  normal X post before posting autonomously, and stops after 30 per UTC day.
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
