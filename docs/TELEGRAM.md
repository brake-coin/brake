# STOPAI Telegram bot

The bot has two clear AI paths:

- Public website images are BYOK. Each visitor connects OpenRouter in their browser.
- Telegram chat and limited bot-made media use one shared admin-linked OpenRouter key.

The public website never receives or uses the shared key.

The community group is [@StopAiCoin](https://t.me/StopAiCoin). The bot account is
[@StopAiToken_bot](https://t.me/StopAiToken_bot), but normal conversations happen only
inside the one group configured by `TELEGRAM_ALLOWED_CHAT_ID`. Messages from every other
group are ignored.

## Create the bot

1. Open Telegram and message the official [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, choose the display name `STOPAI ✋🏻😡`, and choose an available
   username ending in `bot`.
3. Keep the token secret. Open `https://stopai-coin.fly.dev/admin`, paste it in the
   Telegram bot section, and choose **Connect bot**.
4. Leave BotFather privacy mode on. In groups, STOPAI replies only when mentioned or
   directly replied to.

Set these public environment values before starting the bot:

- `TELEGRAM_ALLOWED_CHAT_ID` is the only group or supergroup allowed to use the bot. It
  can be a public handle such as `@StopAiCoin` or a numeric Telegram chat ID.
- `TELEGRAM_COMMUNITY_URL` is the HTTPS `t.me` link shown to people who message the bot
  privately.
- `TELEGRAM_GALLERY_CHAT_ID` is the chat whose saved gallery supplies the random media in
  private replies. It normally matches the allowed chat.

The bot resolves both chat settings through Telegram before it starts polling. It stays
stopped if the allowed value does not resolve to a group or supergroup. This makes a bad
or missing production setting fail closed instead of opening the bot to other groups.

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
- `Make an angry STOPAI sticker for the shared pack.`
- `Send a random sticker.`
- `Show me the sticker pack.`
- `Animate the image I replied to.`
- `Remix gallery item a1b2c3d4 as a newspaper cartoon.`
- `Show me the latest three gallery items.`
- `Bring back the image about a timeout.`
- `Remove gallery item a1b2c3d4.` (operator only)
- `Post the latest image on X with this text: ...`
- `Read this X post and summarize it: https://x.com/.../status/...`
- `Search recent X posts about stopping the AI race.`
- `Turn @canadabirdie's latest original post into a STOPAI meme and post it with attribution.` (media review is a second step)

The first shared sticker pack must be created by a group administrator, configured operator,
or the user in `TELEGRAM_STICKER_OWNER_ID`. After that, the saved owner stays attached to the
pack and normal sticker proposals can use it safely.

Reply to an image while asking for a new image or video to use it as a reference. In the
group, an upload must mention or reply to the bot. This lets people bring BYOK-made media
into Telegram without charging the server again.

The mention must match the bot's full username. A longer username that merely starts the
same way does not count. A text message containing only the mention is ignored. Setting
`TELEGRAM_REPLIES_ENABLED=false` disables all group text replies, media saves, and upload
acknowledgements. Private messages still receive the fixed redirect described below.

Private chat is disabled at the application level. Any DM gets one random image, sticker, or video
from the community group's bot gallery plus a button linking to
[@StopAiCoin](https://t.me/StopAiCoin). A DM never reaches the AI, spends shared budget,
or saves uploaded media. If the group gallery is empty or unavailable, the bot sends the
group link without media.

A caption can also be the request. For example, upload an image with `remix this as a
STOPAI poster` or `animate this`. The bot saves the upload, then uses it as the media
reference. Anyone can reply to Telegram media and propose an X post or ask for a draft.
The request is not an order. The agent decides whether to publish now, draft, ask a useful
question, decline, or conserve the account timer and shared media capacity. It can reject
repetitive, low-effort, off-topic, or spammy proposals even when they are otherwise safe.

The agent receives media provenance, its saved prompt or caption, and the conversation,
but it cannot inspect final pixels or frames during Telegram chat. It writes accessibility
text itself from that context. If context for an uploaded item is too weak, it may decline
or ask a natural question; there is no required confirmation sentence or user-supplied
alt-text form. The server adds an honest provenance-based fallback if the agent omits alt
text, while the X client still attaches alt text before publishing.

All normal replies go through the shared agent so it can decide whether to answer, use a
tool, or refuse a weak use of scarce capacity. Each turn includes live global and current-
user counts for image, video, X research, and X posting, plus cooldown and spend status. Sticker
generation shares the image counts and daily media-spend cap. This lets the
agent save the last image for a new participant instead of mechanically serving a repeat
request. Atomic server limits still make the final decision under concurrency. Ask `help`,
`what is the CA?`, or `what AI are you using?` naturally.

Recent chat context is separated by Telegram forum topic. The agent receives the full 20-message
topic window plus four clearly marked recent messages from other topics, which helps with wider
group references without blending complete topic discussions together. Participant labels are
added outside the saved message text, and raw Telegram user IDs are not added to model prompts or
replies. User/reply pairs are saved together and requests in the same topic run in order, so a
failed or overlapping request cannot leave a half-written turn. The bot keeps at most 20 recent
messages in each of at most 100 conversation buckets. Chat content expires after 30 days.

Only updates that can cause an action are written to the durable duplicate-protection
ledger. It keeps at most 2,000 claims for eight days, which covers Telegram retry windows
without rewriting the state file for normal ignored group traffic. Logs record why an
update was accepted or ignored, how it was addressed, timing, model, tool, and cost when
relevant. Chat, user, and update IDs are short keyed hashes. Message text, captions, media
URLs, tokens, and unknown fields are not written to these event logs.

The chat persona is deliberately a little degen: short, crypto-native, mischievous, and
occasionally lowercase, with the weird hand as a recurring brake-operator character. It
uses slang lightly and never turns the joke into price hype, trading advice, harassment,
or vague claims. Contract details, research, attribution, and risk warnings stay exact.
Its main bit is the AI-crypto counter-meta: everyone brought more acceleration, while
STOPAI brought the brake. “Pivot to stop AI crypto” always means the idea, not a portfolio.

Ask `What is my Telegram ID?` and put that numeric ID in `TELEGRAM_OPERATOR_IDS`.
Telegram administrators in the configured group are also treated as operators. Every user
can propose an X post, and the agent decides whether it is original, useful, safe, relevant,
well timed, and worth publishing. There is no regex preflight, forced tool choice, or right
to spend a shared generation because a user asked.
Successful Telegram posts have a one-hour account cooldown and a four-hour per-user
cooldown, plus limits of 20 manual posts per hour, 80 per day, 10 per user per hour, and 30
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
or a post is created. Concurrent requests see the pending claim and stop. If X returns a
post ID but verification fails, the source is marked uncertain and stays blocked so a retry
cannot create a duplicate. Older used-source research and confirmed receipts are imported
into the ledger when encountered. The state keeps the newest 50,000 source decisions, which
is several years of records at the current limits and prevents the file from growing without
bound.

X research is capped at 200 requests per hour and 1,000 per UTC day globally, plus 50 per user
per hour and 200 per user per day.

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
or repetitive cycles. It checks its posting timer before spending research or model budget,
and receives live media capacity before choosing text, image, video, or skip.

Reply, repost, quote-post, sensitive, self-post, stale, and previously used candidates are
removed before the autonomous model sees them. By default, a source must be no more than
seven days old. The selected X source is read and checked again immediately before its
durable source claim and any public action.

Autonomous posts always keep the selected source link. The agent can choose text, image,
or video, waits at least four hours after either a Telegram or autonomous X post, and stops
after 30 autonomous posts per UTC day. Live admin tests use the same public cooldown.
It waits fifteen minutes after startup and shares the existing chat, media, and
$50 daily AI-spend limits. Research and posting history survive deploys on the encrypted
Fly volume. The admin page shows goal, memory, research, and last-cycle counts alongside
the live test buttons.

After X verifies an autonomous post, the bot sends that post's text and canonical X link
to the configured Telegram group. The link preview carries the X post into the group feed.
If Telegram is restarting or briefly unavailable, the durable X receipt keeps the share
pending and retries it on a later campaign cycle. A Telegram delivery failure never causes
the already-published X post to be published again. Admin live-test posts are not shared.

Telegram users can ask `what are your goals and memories?` to inspect the campaign context.
Every user may request an agent-approved X post. Group administrators and configured operator
IDs may also save stable notes or update goals in plain language. Ordinary users cannot alter
the long-term campaign identity.

The official posting account is [@STOPAICOIN](https://x.com/STOPAICOIN). It is separate
from [@canadabirdie](https://x.com/canadabirdie), which Bags shows with a 100%
share of the STOPAI creator-fee distribution.

## Default limits

| Use | Global hourly | Global daily | Per-user hourly | Per-user daily |
| --- | ---: | ---: | ---: | ---: |
| Chat | 300 | 2,000 | 100 | 500 |
| Image | 20 | 100 | 10 | 30 |
| Video | 10 | 20 | 10 | 10 |

Shared image and video generation also stop when recorded daily AI spend reaches $50.
Generated stickers use the image row because each sticker spends one shared image generation.
All limits can be overridden through the matching environment settings. A limit of zero
turns that feature off.

## Safety and project facts

The bot is instructed to support peaceful and lawful public action. It must not invent
a contract, wallet, fee use, partnership, price, return, or endorsement. Public posts must
not contain private information, identifiable private people without consent, unsupported accusations,
impersonation, hateful or sexual abuse, threats, deceptive media, copied writing, or spam. It gives only
the official mint `2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS` and official Bags
link. It identifies [@canadabirdie](https://x.com/canadabirdie) as the holder of a
100% share of the STOPAI creator-fee distribution on Bags. This means 100% of Bags
creator fees, not all trading or protocol fees. STOPAI is independent. The bot never tells people to buy or
pump the token.

Telegram stores chat content and uploaded media under its own terms. OpenRouter and
the selected model providers process prompts and server-generated media. Video jobs
are asynchronous and are not eligible for OpenRouter zero-data-retention mode.
