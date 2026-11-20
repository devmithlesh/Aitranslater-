import type { ClientKind, FeedbackCategory } from '@verba/shared';
import type { Storage } from '../storage/types';

/** Stores product feedback. It costs no credits and never touches an AI provider. */
export class FeedbackService {
  constructor(
    private readonly storage: Storage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async add(args: { id: string; userId: string; category: FeedbackCategory; message: string; client: ClientKind }): Promise<void> {
    await this.storage.insertFeedback({
      id: args.id,
      userId: args.userId,
      category: args.category,
      message: args.message,
      client: args.client,
      version: null,
      createdAt: this.now().toISOString(),
    });
  }
}
