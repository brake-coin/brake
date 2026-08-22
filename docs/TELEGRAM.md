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

## Commands

- `/start` and `/help` explain the bot.
- `/whoami` shows the caller's numeric Telegram ID.
- `/status` shows safe connection and budget information.
- `/image <idea>` creates one shared-budget image. `/meme` is an alias.
- `/video <idea>` creates one short shared-budget video.
- `/latest` resends the latest saved image or video in that chat.

Reply to an image with `/image` or `/video` to use it as a reference. Sending an image
or video to the bot in a private chat saves only Telegram's reusable file ID and basic
metadata. In a group, the upload must mention or reply to the bot. This lets people
bring BYOK-made media into Telegram without charging the server again.

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
a contract, wallet, grant, partnership, price, return, or endorsement. It gives only
the official mint `2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS` and official Bags
link. STOPAI is independent. The bot never tells people to buy or pump the token.

Telegram stores chat content and uploaded media under its own terms. OpenRouter and
the selected model providers process prompts and server-generated media. Video jobs
are asynchronous and are not eligible for OpenRouter zero-data-retention mode.
