export interface WriteTemplate {
  id: string;
  label: string;
  prompt: string;
}

/** Starter prompts for the Ask tab. The user edits the [bracketed] parts before asking. */
export const WRITE_TEMPLATES: readonly WriteTemplate[] = [
  {
    id: 'leave',
    label: 'Leave application',
    prompt: 'Write a leave application to my [manager/principal] for [2 days] from [date] because [reason].',
  },
  {
    id: 'email',
    label: 'Professional email',
    prompt: 'Write a professional email to [name] about [topic]. Keep it short and polite.',
  },
  {
    id: 'followup',
    label: 'Follow-up',
    prompt: 'Write a polite follow-up message to [name] about [topic]. I have not heard back since [date].',
  },
  {
    id: 'cover',
    label: 'Cover letter',
    prompt: 'Write a short cover letter for the [job title] role at [company]. My experience: [2-3 points].',
  },
  {
    id: 'complaint',
    label: 'Complaint',
    prompt: 'Write a firm but polite complaint to [company] about [problem]. I want [refund/replacement/fix].',
  },
  {
    id: 'reminder',
    label: 'Payment reminder',
    prompt: 'Write a friendly reminder to [client] that the payment of [amount] for [work] is due on [date].',
  },
  {
    id: 'reply',
    label: 'Reply politely',
    prompt: 'Write a polite reply to this message: [paste the message]. I want to say: [your point].',
  },
  {
    id: 'explain',
    label: 'Explain simply',
    prompt: 'Explain [topic] in very simple words with one example.',
  },
];
