# STOPAI Telegram bot

The bot has two clear AI paths:

- Public website images are BYOK. Each visitor connects OpenRouter in their browser.
- Telegram chat and limited bot-made media use one shared admin-linked OpenRouter key.

The public website never receives or uses the shared key.

The community group is [@stopaitoken](https://t.me/stopaitoken). That is the group
handle, not the bot account. The separate bot username is still pending in BotFather.

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
- `Turn @canadabirdie's latest original post into a STOPAI meme and post it with attribution.`

Reply to an image while asking for a new image or video to use it as a reference. Sending an image
or video to the bot in a private chat saves only Telegram's reusable file ID and basic
metadata. In a group, the upload must mention or reply to the bot. This lets people
bring BYOK-made media into Telegram without charging the server again.

A caption can also be the request. For example, upload an image with `remix this as a
STOPAI poster` or `animate this`. The bot saves the upload, then uses it as the media
reference. Anyone can reply to Telegram media with an X-post request. The agent receives
that media's gallery ID and decides whether to attach it when it calls the posting tool.

All normal replies go through the shared agent so it can decide whether to answer or use
a tool. Ask `help`, `what is the CA?`, `what AI are you using?`, or `what is my
Telegram ID?` naturally.

Ask `What is my Telegram ID?` and put that numeric ID in `TELEGRAM_OPERATOR_IDS`.
Telegram administrators in the configured group are also treated as operators for
gallery deletion only. Every user receives the X posting tool. The agent decides from
the conversation whether to call it; there is no regex preflight or forced tool choice.
Successful posts have a five-minute global cooldown and a fifteen-minute per-user
cooldown, plus limits of 6 posts per hour, 24 per day, 2 per user per hour, and 6 per
user per day.

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

Image upload uses the simple media endpoint; video upload uses the INIT, APPEND,
FINALIZE, and STATUS flow.

The production service also runs a bounded autonomous schedule. By default it attempts
one post every eight hours, rotates text, image, and video, and stops after three posts
per UTC day. It waits one hour after startup, skips work until both X and OpenRouter are
connected, and shares the existing chat, media, and $5 daily AI-spend limits. The admin
page shows the schedule and provides one live test button for each post type.

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
a contract, wallet, fee use, partnership, price, return, or endorsement. It gives only
the official mint `2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS` and official Bags
link. It identifies [@canadabirdie](https://x.com/canadabirdie) as the configured Bags
creator-fee recipient. STOPAI is independent. The bot never tells people to buy or
pump the token.

Telegram stores chat content and uploaded media under its own terms. OpenRouter and
the selected model providers process prompts and server-generated media. Video jobs
are asynchronous and are not eligible for OpenRouter zero-data-retention mode.
