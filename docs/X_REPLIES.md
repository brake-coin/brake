# X replies

The owner console has a reply inbox for @STOPAICOIN. **Check mentions** reads recent X mentions and replies. The inbox accepts a post when its author follows @STOPAICOIN and either mentions the account directly or replies to one of its posts. The owner can ask AI to draft a reply, skip the post, or flag possible spam. A spam flag opens the original post so the owner can use X's Report action.

Each reply goes to the user's original post. Before sending, the server checks that the post still exists, the author still follows the account, the post is still eligible, and the author has not opted out. It adds “Reply STOP to opt out.” A STOP reply records an opt-out. The store permits one reply per post, one reply per author in 24 hours, and ten replies total in 24 hours. Unclear X send results stay blocked for owner review.

Follower checks scan at most five X pages of 1,000 followers each. A person outside those pages waits for a future lookup method before they can receive a reply.

Automatic AI replies require X's prior written approval under the [X automation rules](https://help.x.com/en/rules-and-policies/x-automation). Request approval through the [X Developer Portal](https://developer.x.com/en/portal/dashboard) or an X account contact. Keep the written approval with the project records. Once X grants it, set `X_AI_REPLIES_ENABLED=true` and set `X_AI_REPLY_APPROVAL_REFERENCE` to the approval's reference. `X_AI_REPLY_POLL_MINUTES` defaults to 30 and accepts 15 to 1440 minutes. Both settings are needed for the scheduled path to start. The Fly config leaves automatic replies off by default.

The scheduled path checks up to 100 recent mentions per cycle. It reviews up to three new posts with AI. A direct mention needs a clear question or request; a reply to a STOPAI post already shows intent. AI may choose `reply`, `skip`, or `report_spam`. Spam flags enter the owner inbox for review. Each AI reply passes the same live checks and sends one short answer with the opt-out line. Shared chat limits also bound AI review calls.

Run `pnpm check` before changing this path. Test the owner console with sample records and a narrow viewport. Use live X replies only after the needed X approval and release review.
