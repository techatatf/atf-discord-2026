import { ButtonInteraction, Interaction } from 'discord.js';
import { handleApproveButton } from '../handlers/approveButton';
import { handleRejectButton } from '../handlers/rejectButton';
import { handleRequestButton } from '../handlers/requestButton';

export async function onInteractionCreate(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;

  const button = interaction as ButtonInteraction;
  const { customId } = button;

  try {
    if (customId === 'mentor_request') {
      await handleRequestButton(button);
      return;
    }

    if (customId.startsWith('mentor_approve:')) {
      const targetUserId = customId.split(':')[1];
      await handleApproveButton(button, targetUserId);
      return;
    }

    if (customId.startsWith('mentor_reject:')) {
      const targetUserId = customId.split(':')[1];
      await handleRejectButton(button, targetUserId);
      return;
    }
  } catch (err) {
    console.error(`Error handling interaction [${customId}]:`, err);
    const reply = button.replied || button.deferred
      ? button.followUp({ content: 'An unexpected error occurred. Please try again or contact an admin.', ephemeral: true })
      : button.reply({ content: 'An unexpected error occurred. Please try again or contact an admin.', ephemeral: true });
    await reply.catch(() => null);
  }
}
