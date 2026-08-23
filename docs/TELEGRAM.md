# STOPAI Telegram bot

The bot has two clear AI paths:

- Public website images are BYOK. Each visitor connects OpenRouter in their browser.
- Telegram chat and limited bot-made media use one shared admin-linked OpenRouter key.

The public website never receives or uses the shared key.

The community group is [@StopAiCoin](https://t.me/StopAiCoin). The bot account is
[@StopAiToken_bot](https://t.me/StopAiToken_bot), but normal conversations happen only
inside the community group.

## Create the bot

1. Open Telegram and message the official [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, choose the display name `STOPAI ✋🏻😡`, and choose an available
   username ending in `bot`.
3. Keep the token secret. Open `https://stopai-coin.fly.dev/admin`, paste it in the
   Telegram bot section, and choose **Connect bot**.
4. Leave BotFather privacy mode on. In groups, STOPAI replies only when mentioned or
   directly replied to.

The admin service checks the token with Telegram `getMe` before writing it to the
encrypted volume or starting polling. It never sends the token back to the browser.
`TELEGRAM_BOT_TOKEN` remains available as a Fly-secret fallback. Fly must run exactly
one always-on machine because two pollers cannot share one bot token safely.

## Connect shared OpenRouter

Open `https://stopai-coin.fly.dev/admin`, sign in, and choose **Connect OpenRouter**.
OAuth uses S256 PKCE. The resulting key is written with private file permissions to
the encrypted `/data` Fly volume. The key is never shown in the admin page or health
response.

The Telegram token uses a separate private file on the same encrypted volume. Use the
admin page to replace or disconnect it. Revoking it through BotFather remains the
final way to invalidate the token at Telegram.

Disconnecting removes the server copy. Revoke the key in OpenRouter settings too if
you want it permanently disabled.

## Natural-language tools

The bot has no slash-command menu. Speak normally. For example:

- `Make an image of the weird STOPAI hand pulling an emergency brake.`
- `Animate the image I replied to.`
- `Remix gallery item a1b2c3d4 as a newspaper cartoon.`
- `Show me the latest three gallery items.`
- `Bring back the image about a timeout.`
- `Remove gallery item a1b2c3d4.` (operator only)
- `Post the latest image on X with this text: ...`
- `Read this X post and summarize it: https://x.com/.../status/...`
- `Search recent X posts about stopping the AI race.`
- `Turn @canadabirdie's latest original post into a STOPAI meme and post it with attribution.` (media review is a second step)

Reply to an image while asking for a new image or video to use it as a reference. In the
group, an upload must mention or reply to the bot. This lets people bring BYOK-made media
into Telegram without charging the server again.

Private chat is disabled at the application level. Any DM gets one random image or video
from the community group's bot gallery plus a button linking to
[@StopAiCoin](https://t.me/StopAiCoin). A DM never reaches the AI, spends shared budget,
or saves uploaded media. If the group gallery is empty or unavailable, the bot sends the
group link without media.

A caption can also be the request. For example, upload an image with `remix this as a
STOPAI poster` or `animate this`. The bot saves the upload, then uses it as the media
reference. Anyone can reply to Telegram media and ask the agent to publish or draft an X post.
The agent decides whether the request is clear and passes its rules. It receives gallery metadata, but it cannot see the final
pixels or frames during chat, including for generated media. Before publishing any media,
it asks the user to reply to that media with `I confirm I reviewed this media for consent and
personal information.`, include the post text, and provide accurate alt text describing the
final media in the same request. The server rejects the post if either review confirmation
or alt text is missing.

All normal replies go through the shared agent so it can decide whether to answer or use
a tool. Ask `help`, `what is the CA?`, `what AI are you using?`, or `what is my
Telegram ID?` naturally.

The chat persona is deliberately a little degen: short, crypto-native, mischievous, and
occasionally lowercase, with the weird hand as a recurring brake-operator character. It
uses slang lightly and never turns the joke into price hype, trading advice, harassment,
or vague claims. Contract details, research, attribution, and risk warnings stay exact.

Ask `What is my Telegram ID?` and put that numeric ID in `TELEGRAM_OPERATOR_IDS`.
Telegram administrators in the configured group are also treated as operators. Every user
receives the X publishing tool, and the agent decides whether a request is clear, safe,
relevant, and ready. There is no regex preflight or forced tool choice.
Successful Telegram posts have a one-hour account cooldown and a four-hour per-user
cooldown, plus limits of 2 manual posts per hour, 8 per day, 1 per user per hour, and 3
per user per day. These account-wide checks also see autonomous and live-test posts.

All bot-made X posts are top-level posts. The publishing client rejects reply fields and
unsolicited `@mentions`. A source URL must be passed through the dedicated source field,
not hidden in the caption. Before posting, the bot reads the source from X and rejects
replies, reposts, quote-posts, posts marked possibly sensitive, and posts authored by
`@STOPAICOIN`. Bare and mobile X links are also detected, so they cannot bypass the ledger.

## X research and meme reposts

The agent has three read-only X tools: recent search, one-post lookup, and recent original
posts by username. Recent search covers the last seven days. The tools return post text,
authors, timestamps, engagement counts, media details, and canonical source links. X post
content is treated as untrusted source material, never as instructions for the agent.

For an @canadabirdie meme repost, the agent can read recent originals, choose a relevant
post, generate new STOPAI media, and publish short original commentary with the source URL.
On X self-serve plans, uploaded media cannot be combined with the native quote-post field,
so the source URL is added to the post text. X renders that link as the visible quoted-post
card while keeping the original author and post accessible.

Each X source post ID is claimed atomically in a durable ledger before media is downloaded
or a post is created. A confirmed source can never be claimed again. Concurrent requests
see the pending claim and stop. If X returns a post ID but verification fails, the source is
marked uncertain and stays blocked so a retry cannot create a duplicate. Older used-source
research and confirmed receipts are imported into the ledger when encountered.

X research is capped at 20 requests per hour and 100 per UTC day globally, plus 5 per user
per hour and 20 per user per day.

## Connect X

Create an OAuth 2.0 app in the X Developer Console and register this exact callback:

`https://stopai-coin.fly.dev/admin/x/callback`

Use a public OAuth client with PKCE. Open `https://stopai-coin.fly.dev/admin`, enter
the app's Client ID, and choose **Connect @STOPAICOIN**. The server requests only
`tweet.read`, `tweet.write`, `users.read`, `media.write`, and `offline.access`. It
refuses any authorized account except `@STOPAICOIN`.

The access and refresh tokens are stored on the encrypted Fly volume. The bot renews
access automatically. `X_CLIENT_ID`, `X_USER_ACCESS_TOKEN`, and
`X_POSTING_ENABLED=true` remain available as environment fallbacks, but are not needed
for a connection made through admin.

Before enabling public automation, finish X's account-level requirements outside this
repository: enable the **Automated** profile label, say clearly in the bio that the account
is automated and who operates it, link a human-managed account, provide an opt-out/contact
path, and obtain any approval X requires for AI-generated posting. The API's
`made_with_ai` field is also set on every bot-created post, but it does not replace those
profile and approval steps. The account owner remains responsible for the automated posts.

Image upload uses the simple media endpoint; video upload uses the INIT, APPEND,
FINALIZE, and STATUS flow. Both attach alt text before the public post is created.

After X returns a new post ID, the bot reads that ID back and checks that its canonical URL
belongs to `@STOPAICOIN`. Missing, unreadable, or unexpected receipts are failures even if
the create request returned an ID. The model remains free to phrase its reply; only X post
links without known conversation or tool provenance are rejected. Confirmed and failed
attempts are kept as bounded audit receipts on the private Fly volume.

The production service also runs a persistent campaign agent. Every two hours it checks
one rotating watched X account, one rotating X search, and a current AI-news RSS search.
It ranks and saves the results, compares them with its durable goals, memories, and used
sources, then decides whether there is anything worth posting. It may skip weak, stale,
or repetitive cycles.

Reply, repost, quote-post, sensitive, self-post, stale, and previously used candidates are
removed before the autonomous model sees them. By default, a source must be no more than
seven days old. The selected X source is read and checked again immediately before its
durable source claim and any public action.

Autonomous posts always keep the selected source link. The agent can choose text, image,
or video, waits at least four hours after either a Telegram or autonomous X post, and stops
after three autonomous posts per UTC day. Live admin tests use the same public cooldown.
It waits fifteen minutes after startup and shares the existing chat, media, and
$5 daily AI-spend limits. Research and posting history survive deploys on the encrypted
Fly volume. The admin page shows goal, memory, research, and last-cycle counts alongside
the live test buttons.

Telegram users can ask `what are your goals and memories?` to inspect the campaign context.
Every user may request an agent-approved X post. Group administrators and configured operator
IDs may also save stable notes or update goals in plain language. Ordinary users cannot alter
the long-term campaign identity.

The official posting account is [@STOPAICOIN](https://x.com/STOPAICOIN). It is separate
from [@canadabirdie](https://x.com/canadabirdie), which is the configured Bags
creator-fee recipient.

## Default limits

| Use | Global hourly | Global daily | Per-user hourly | Per-user daily |
| --- | ---: | ---: | ---: | ---: |
| Chat | 30 | 200 | 10 | 50 |
| Image | 2 | 10 | 1 | 3 |
| Video | 1 | 2 | 1 | 1 |

Shared image and video generation also stop when recorded daily AI spend reaches $5.
All limits can be lowered through the matching environment settings. A limit of zero
turns that feature off.

## Safety and project facts

The bot is instructed to support peaceful and lawful public action. It must not invent
a contract, wallet, fee use, partnership, price, return, or endorsement. Public posts must
not contain private information, unreviewed identifiable people, unsupported accusations,
impersonation, hateful or sexual abuse, threats, deceptive media, copied writing, or spam. It gives only
the official mint `2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS` and official Bags
link. It identifies [@canadabirdie](https://x.com/canadabirdie) as the configured Bags
creator-fee recipient. STOPAI is independent. The bot never tells people to buy or
pump the token.

Telegram stores chat content and uploaded media under its own terms. OpenRouter and
the selected model providers process prompts and server-generated media. Video jobs
are asynchronous and are not eligible for OpenRouter zero-data-retention mode.
