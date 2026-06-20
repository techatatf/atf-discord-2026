# Discord Engagement Bots Research

Date: 2026-06-04

## Request

The team asked for bots that:

- Check in with newly onboarded users.
- Point students to prerequisite resources.
- Prompt students to register for Kaggle courses.
- Prompt students to post their profile in the relevant channel.
- Track active and inactive users so staff can DM inactive users and re-engage them.

```md
We have been thinking about including some bots to help with user engagement.

1. A bot that checkins with users and makes sure they know where to find resources. It provides a checklist as soon as they are onboarded to visit the pre-req resources channel, register for the Kaggle courses and post their profile in the relevant channel.

2. We also want a bot that keeps track of active and inactive users, so we can dm inactive users directly and get them engaged.
These bots may be very useful as we continue to explore how we can get more students engaged on discord. Please help with this as soon as you can. We are available for chat.
```

## Recommendation

Use a hybrid approach:

1. Configure Discord's native Community Onboarding and Server Guide for the static first-run experience.
2. Extend the existing ATF Discord bot with engagement modules for stateful checklists, profile-post detection, activity tracking, inactive-user reporting, and audited outreach.
3. Avoid separate bots for onboarding and engagement at first. The current bot already has the Discord client, slash-command registration, member-join event handling, SQLite persistence, and deployment flow. Two logical modules inside one bot will be simpler to operate than two separate bot applications.

Do not start with a third-party analytics bot unless the team wants an external dashboard immediately. Tools such as Statbot, YellowWorm, ServerLens, and Statora cover analytics, but they do not solve the specific ATF onboarding checklist and profile workflow cleanly, and they add third-party data handling.

## Key Findings

### Native Discord features cover part of the request

Discord Community Onboarding lets admins define default channels, questions, and role/channel assignments for new members. Discord Server Guide adds a welcome sign, 3-5 new-member tasks, and resource pages inside the onboarding flow.

This means the "know where to find resources" part should not be purely bot-driven. The most reliable first step is to make the server itself easier to navigate:

- Add `#pre-req-resources` as a default channel or Server Guide resource.
- Add "Register for Kaggle courses" as a Server Guide new-member task.
- Add "Post your profile" as a Server Guide new-member task linked to the relevant profile channel.
- Use onboarding questions for role/channel routing only if students have tracks, cohorts, or interests that change the channels they need.

Limits: Discord's native onboarding is good for navigation, but it does not give us a custom database of who finished each task, who posted a profile, or who needs follow-up. That is where the custom bot is useful.

### The current repo is a good base

The repo is already a TypeScript `discord.js` bot. Current capabilities:

- Uses `discord.js` v14.
- Registers guild slash commands in `src/events/ready.ts`.
- Handles `guildMemberAdd` in `src/events/guildMemberAdd.ts`.
- Tracks invite role assignments in SQLite via `src/db.ts`.
- Uses `GatewayIntentBits.Guilds`, `GuildMembers`, and `GuildInvites` in `src/index.ts`.

This means the new work can be built as additive modules:

- `src/onboarding/*`
- `src/engagement/*`
- new commands under `src/commands/*`
- new event handlers for `messageCreate`, `messageReactionAdd`, `voiceStateUpdate`, and existing `interactionCreate`
- extra SQLite tables in `src/db.ts`

### Message content intent is probably not needed

For activity tracking, we only need metadata: user ID, guild ID, channel ID, event type, and timestamp. Discord message objects include ID, channel, author, and timestamp. Without the privileged Message Content intent, content-like fields are empty, but metadata remains enough for activity.

Recommended activity signals:

- Message sent in tracked channels.
- Reaction added in tracked channels.
- Voice join/leave/session duration, if useful.
- Slash command or button interaction with the bot.
- Profile posted in the configured profile channel.
- Checklist button clicks.

Avoid storing message content. Avoid Presence tracking unless the team explicitly needs online/offline status; presence requires a privileged intent and is not necessary for engagement follow-up.

### DM outreach must be careful

Discord's Create DM documentation warns that bots should not DM everyone in a server and that DMs should generally be initiated by user action. Users can also block DMs from shared-server members or block the bot, so DM delivery is not guaranteed.

The bot should not auto-DM inactive users in bulk on its own. Safer design:

- Staff runs `/engagement-inactive days:7 role:Student`.
- Bot shows an ephemeral preview/report to the staff member.
- Staff selects users or confirms a capped batch.
- Bot sends DMs through a queue with rate-limit handling.
- Bot logs every attempted DM and whether it succeeded or failed.
- Users have an opt-out path for nonessential reminders.

This is better operationally and reduces policy/spam risk.

### Policy constraints matter

Discord's Developer Policy says apps should not misrepresent or manipulate engagement, including automating messages for the purpose of maintaining server activity. It also requires API data to be used only for the app's stated functionality, not for unrelated profiling, discrimination, or monetization.

For ATF, the stated purpose should be narrow: onboarding support and staff-visible engagement operations for the program. Store the minimum necessary data, document it, and do not analyze message content.

## Build vs Buy

### Native Discord only

Best for:

- Immediate navigation improvements.
- Resource pages.
- First-run tasks.
- Role/channel selection.

Not enough for:

- Per-student checklist status.
- "Has this student posted their profile?"
- Inactive-user lists.
- DM campaigns with audit logs.
- Cohort-level engagement reports.

### Third-party analytics bot

Examples researched:

- Statbot: dashboard, message/voice stats, invite tracking, drilldowns.
- YellowWorm: community health, inactive/key-member quiet alerts, minimal permissions claims.
- ServerLens: engagement dashboard, activity trends, AI questions.
- Statora: message/voice stats, member growth, invites, dashboards.

Best for:

- Fast analytics dashboard.
- Historical message/voice charts.
- Heatmaps and channel/member drilldowns.

Concerns:

- External vendor sees Discord activity metadata, and sometimes more depending on permissions.
- Fit is generic, not ATF-specific.
- Usually will not verify Kaggle/profile/checklist completion.
- Adds another bot and another operational dependency.

### Custom ATF bot extension

Best for:

- Exact checklist workflow.
- Profile-post tracking.
- Student-specific state and staff reports.
- Controlled data retention.
- Reuse of existing bot deployment and SQLite database.

Cost:

- More engineering work.
- Need to define privacy/retention clearly.
- Need support for rate limits, failed DMs, and staff permissions.

Recommended: use native Discord plus custom extension. Add third-party analytics only if the team later needs richer dashboards than slash-command reports.

## Proposed Product Behavior

### New-member checklist

Trigger: `guildMemberAdd`.

Bot actions:

1. Create `onboarding_checklists` row for the new member.
2. Try to DM the student a checklist.
3. Also post or update a low-noise welcome message in a configured start channel if DMs fail or if the team wants visible onboarding.

Checklist items:

- Visit prerequisite resources.
- Register for Kaggle courses.
- Submit Kaggle profile link or username.
- Post student profile.

Completion methods:

- "Visited resources": student clicks an "I found the resources" button.
- "Registered for Kaggle": student clicks a button and optionally submits Kaggle profile URL through a modal.
- "Posted profile": bot marks complete when the user posts in the configured profile channel, or preferably when they submit a bot modal and the bot posts a formatted profile for them.

The modal approach is cleaner than asking students to free-form post a profile, because it avoids needing Message Content intent and produces consistent profiles.

### Check-in cadence

Suggested reminders:

- Immediately on join: checklist DM.
- 24 hours after join: reminder only for incomplete tasks.
- 72 hours after join: second reminder plus "need help?" action.
- 7 days after join: staff report, not another automatic student DM.

Avoid indefinite automatic reminders. Too many reminders will feel like spam and will create DM failures.

### Activity tracking

Activity definition should be explicit. Suggested MVP:

- `active_7d`: at least one tracked activity event in the last 7 days.
- `active_30d`: at least one tracked activity event in the last 30 days.
- `inactive_7d`: no tracked activity in the last 7 days.
- `never_activated`: joined more than 48 hours ago and has no tracked activity or incomplete profile/checklist.

Tracked events:

- `message_create`
- `message_reaction_add`
- `voice_session`
- `bot_interaction`
- `profile_submitted`
- `checklist_item_completed`

Recommended exclusions:

- Admin/mod channels.
- Bot messages.
- Announcement-only channels, unless reaction counts matter.
- Any private or sensitive channels unless explicitly approved.

### Staff commands

Suggested MVP commands:

- `/onboarding-status user:@student`
- `/onboarding-resend user:@student`
- `/onboarding-report status:incomplete`
- `/engagement-summary days:7`
- `/engagement-inactive days:7 role:Student include-never-activated:true`
- `/engagement-dm-preview template:checkin days:7 role:Student`
- `/engagement-dm-send campaign:<id> limit:25`

All staff commands should be restricted to admin/mod roles, matching the repo's existing invite-command permission model.

## Proposed Data Model

Add tables similar to:

```sql
CREATE TABLE onboarding_checklists (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  resources_ack_at TEXT,
  kaggle_registered_at TEXT,
  kaggle_profile_url TEXT,
  profile_posted_at TEXT,
  profile_message_id TEXT,
  last_reminded_at TEXT,
  reminder_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE engagement_activity (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  channel_id TEXT,
  occurred_at TEXT NOT NULL
);

CREATE INDEX engagement_activity_user_time
  ON engagement_activity (guild_id, user_id, occurred_at);

CREATE TABLE member_activity_rollups (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_activity_at TEXT,
  message_count_7d INTEGER NOT NULL DEFAULT 0,
  reaction_count_7d INTEGER NOT NULL DEFAULT 0,
  voice_seconds_7d INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE engagement_outreach (
  outreach_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  template_key TEXT NOT NULL,
  criteria_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE engagement_outreach_recipients (
  outreach_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempted_at TEXT,
  error TEXT,
  PRIMARY KEY (outreach_id, user_id)
);
```

Retention recommendation:

- Keep rollups for the program duration.
- Keep raw activity events for 30-90 days unless the team needs longer research windows.
- Never store message content for this feature.

## Implementation Plan

### Phase 0: Server configuration

No code required.

- Enable/configure Community Onboarding if not already enabled.
- Add default channels and Server Guide resources.
- Add 3-5 Server Guide tasks matching the student onboarding path.
- Confirm exact channel IDs for prerequisite resources and profile posting.

### Phase 1: Checklist bot

Code changes:

- Add onboarding tables.
- Add join-time checklist creation.
- Add DM/checklist message with buttons.
- Extend `interactionCreate` to handle component interactions and modals.
- Add `/onboarding-status`, `/onboarding-resend`, and `/onboarding-report`.

Verification:

- Unit-test checklist state transitions.
- Test with a staging Discord server and a test user.
- Verify behavior when DMs are disabled.

### Phase 2: Activity tracker

Code changes:

- Add activity tables and rollups.
- Add `GatewayIntentBits.GuildMessages`.
- Optionally add `GuildMessageReactions` and `GuildVoiceStates`.
- Add `messageCreate`, `messageReactionAdd`, and `voiceStateUpdate` handlers.
- Add `/engagement-summary` and `/engagement-inactive`.

Verification:

- Confirm no Message Content intent is requested.
- Confirm bot stores metadata only.
- Confirm excluded channels are ignored.

### Phase 3: Staff-approved outreach

Code changes:

- Add outreach tables.
- Add DM preview command.
- Add queued sending with per-recipient logs.
- Add retry/backoff handling for rate limits and failed DMs.

Verification:

- Test capped batches.
- Test failed DM handling.
- Test audit logs.

### Phase 4: Analytics polish

Optional.

- Weekly summary to staff channel.
- CSV export for inactive users.
- Cohort filters.
- Retention and activation charts.

## Risks And Mitigations

- DMs fail because users disabled DMs: provide a visible start-here channel fallback and log DM failures.
- Bot is perceived as spammy: keep reminders capped and staff-approved after 72 hours.
- Activity tracking feels invasive: store metadata only, disclose purpose, exclude sensitive channels, publish retention.
- Policy risk around fake engagement: do not auto-message to inflate activity; frame outreach as onboarding support.
- Message Content privileged intent review burden: avoid it by using buttons/modals and metadata-only event tracking.
- Kaggle registration cannot be truly verified through Discord alone: use self-attestation or collect Kaggle profile URL; decide whether manual staff review is needed.
- Too many definitions of "inactive": define inactivity in product terms before building reports.

## Open Questions For The Team

1. What exact channels are the prerequisite resources channel and profile-posting channel?
2. Which Kaggle courses are required, and should the bot collect a Kaggle profile URL?
3. Is a self-attestation button enough for "registered for Kaggle courses", or does staff need manual verification?
4. What counts as active: message only, reaction, voice, checklist interaction, or any of these?
5. What inactivity thresholds matter: 48-hour never-activated, 7-day inactive, 14-day inactive, 30-day inactive?
6. Who can view inactive-user reports and send DM campaigns?
7. What should the retention window be for raw activity events?
8. Should outreach DMs be opt-out?

## Suggested Team Response

We researched the bot request and recommend a hybrid approach. Discord's built-in Onboarding and Server Guide should handle the static "where do I go first?" experience, including prerequisite resources and new-member tasks. We should then extend our existing ATF Discord bot with two modules: an onboarding checklist module and an engagement/activity module.

The custom bot can track whether a student acknowledged the resources, submitted a Kaggle profile, posted or submitted their student profile, and whether they have been active recently. Staff will be able to run reports for inactive students and send approved, rate-limited DMs with audit logs. We should avoid automatic mass-DM behavior and avoid storing message content.

## Sources

- Discord Community Onboarding FAQ: https://support.discord.com/hc/hi-in/articles/11074987197975-Community-Onboarding-FAQ
- Discord Server Guide FAQ: https://support.discord.com/hc/en-us/articles/13497665141655-Server-Guide-FAQ
- Discord Community Onboarding Examples: https://support.discord.com/hc/en-us/articles/10394859532823-Community-Onboarding-Examples
- Discord Interactions and Commands: https://docs.discord.com/developers/platform/interactions
- Discord Components and Modals: https://docs.discord.com/developers/platform/components
- Discord Gateway and Privileged Intents: https://docs.discord.com/developers/events/gateway
- Discord User Resource, Create DM warning: https://docs.discord.com/developers/resources/user
- Discord Message Resource: https://docs.discord.com/developers/resources/message
- Discord Rate Limits: https://docs.discord.com/developers/topics/rate-limits
- Discord Developer Policy: https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy
- Discord Developer Terms of Service: https://support-dev.discord.com/hc/en-us/articles/8562894815383-Discord-Developer-Terms-of-Service
- Discord bot data access visibility: https://support.discord.com/hc/en-us/articles/7933951485975-Visibility-of-Bot-Data-Access
- Statbot dashboard docs: https://docs.statbot.net/docs/guide/dashboard/
- YellowWorm analytics overview: https://yellowworm.io/
- ServerLens analytics overview: https://serverlens.co/
- Statora statistics bot overview: https://statora.net/
