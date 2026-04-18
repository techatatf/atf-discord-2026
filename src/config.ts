import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const config = {
  token: requireEnv('DISCORD_TOKEN'),
  mentorRoleId: requireEnv('MENTOR_ROLE_ID'),
  mentorRequestsChannelId: requireEnv('MENTOR_REQUESTS_CHANNEL_ID'),
  mentorApprovalsChannelId: requireEnv('MENTOR_APPROVALS_CHANNEL_ID'),
  mentorGeneralChannelId: requireEnv('MENTOR_GENERAL_CHANNEL_ID'),
  generalRulesChannelId: requireEnv('GENERAL_RULES_CHANNEL_ID'),
  inviteGenAllowlistChannels: (process.env.INVITE_GEN_ALLOWLIST_CHANNELS ?? '').split(',').map(id => id.trim()).filter(Boolean),
  uploadthingToken: requireEnv('UPLOADTHING_TOKEN'),
  adminRoleId: requireEnv('ADMIN_ROLE_ID'),
  modRoleId: requireEnv('MOD_ROLE_ID'),
  studentRoleId: requireEnv('STUDENT_ROLE_ID'),
};
