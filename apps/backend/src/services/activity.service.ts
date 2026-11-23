import type { ActivityType, ClientKind } from '@verba/shared';
import { isGuestUserId } from '../middleware/auth';
import type { UsageService } from './usage.service';

export interface RecordActivityInput {
  userId: string;
  client: ClientKind;
  type: ActivityType;
  /** Language codes to count in stats (translation target and detected source). */
  languages: string[];
  chars: number;
}

/**
 * Counts what was done (how many translations, which languages, how many characters) for the usage stats.
 * It never keeps the text people send or the answers they get: there is no history.
 */
export class ActivityService {
  constructor(private readonly usage: UsageService) {}

  async record(input: RecordActivityInput): Promise<void> {
    // Visitors without an account leave no usage rows behind.
    if (isGuestUserId(input.userId)) return;
    await this.usage.recordActivity(input.userId, input.client, input.type, input.chars, input.languages);
  }
}
