import { chmodSync, existsSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { SupportDiscord } from '../server/support-discord.js';
const token = process.env.SUPPORT_DISCORD_BOT_TOKEN ?? process.env.DISCORD_BOT_TOKEN;
if (!token)
  throw new Error(
    'Set DISCORD_BOT_TOKEN from isobot in an ignored environment file before running support:setup.',
  );
/** @param {string} path @param {unknown} [body] */
async function discord(path, body) {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`Discord setup failed (${response.status}). Check bot permissions.`);
  return /** @type {unknown} */ (await response.json());
}
const id = z.string().regex(/^\d{17,22}$/);
const guilds = z
  .array(z.object({ id, name: z.string() }))
  .parse(await discord('/users/@me/guilds'));
const guild = process.env.SUPPORT_DISCORD_GUILD_ID
  ? guilds.find((value) => value.id === process.env.SUPPORT_DISCORD_GUILD_ID)
  : guilds.length === 1
    ? guilds[0]
    : null;
if (!guild) {
  console.log('Set SUPPORT_DISCORD_GUILD_ID to one of these server IDs:');
  for (const value of guilds) console.log(`${value.name}: ${value.id}`);
  process.exitCode = 1;
} else {
  const application = z
    .object({
      bot: z.object({ id }),
      owner: z.object({ id }).optional(),
      team: z
        .object({ members: z.array(z.object({ user: z.object({ id }) })) })
        .nullable()
        .optional(),
    })
    .parse(await discord('/oauth2/applications/@me'));
  const staff = (
    process.env.SUPPORT_DISCORD_STAFF_IDS ??
    process.env.ISOBOT_ALLOWED_USERS ??
    (application.team
      ? application.team.members.map((member) => member.user.id).join(',')
      : (application.owner?.id ?? ''))
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => id.parse(value));
  if (!staff.length)
    throw new Error('Set SUPPORT_DISCORD_STAFF_IDS to the Discord user IDs allowed to reply.');
  const name = 'myself-md-support';
  const channels = z
    .array(z.object({ id, name: z.string() }))
    .parse(await discord(`/guilds/${guild.id}/channels`));
  const existing = channels.find((channel) => channel.name === name);
  const permissions = 1024n | 2048n | 65536n | 274877906944n;
  const channel =
    existing ??
    z.object({ id, name: z.string() }).parse(
      await discord(`/guilds/${guild.id}/channels`, {
        name,
        type: 0,
        topic:
          'Private myself.md support. Each thread is one customer conversation; text replies from designated staff sync back into the app.',
        permission_overwrites: [
          { id: guild.id, type: 0, deny: '1024', allow: '0' },
          {
            id: application.bot.id,
            type: 1,
            deny: '0',
            allow: String(permissions | 34359738368n | 17179869184n),
          },
          ...staff
            .filter((value) => value !== application.bot.id)
            .map((value) => ({ id: value, type: 1, deny: '0', allow: String(permissions) })),
        ],
      }),
    );
  const config = {
    SUPPORT_DISCORD_BOT_TOKEN: token,
    SUPPORT_DISCORD_CHANNEL_ID: channel.id,
    SUPPORT_DISCORD_STAFF_IDS: staff.join(','),
  };
  await new SupportDiscord(config).verifyChannel();
  if (existsSync('.env.support')) chmodSync('.env.support', 0o600);
  writeFileSync(
    '.env.support',
    Object.entries(config)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
    { mode: 0o600 },
  );
  console.log(
    `Support channel ready: ${guild.name} / ${channel.name} (${channel.id}). Wrote ignored .env.support with mode 0600. No messages sent.`,
  );
  console.log('For the hosted Worker: npx wrangler secret bulk .env.support');
  console.log(
    'For Node: load .env.support alongside the existing environment, then restart the service.',
  );
}
