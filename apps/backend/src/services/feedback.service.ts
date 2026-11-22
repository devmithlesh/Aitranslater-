import type { AdminFeedbackResponse, ClientKind, FeedbackCategory } from '@verba/shared';
import type { Storage } from '../storage/types';

/** Stores product feedback. It costs no credits and never touches an AI provider. */
export class FeedbackService {
  constructor(
    private readonly storage: Storage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The newest messages with the name and email of whoever wrote them. For the admin's Feedback tab. */
  async list(limit: number): Promise<AdminFeedbackResponse> {
    const records = await this.storage.listFeedback(limit);
    const users = new Map<string, { name: string; email: string } | null>();
    const items = [];
    for (const record of records) {
      if (!users.has(record.userId)) {
        const user = await this.storage.getUser(record.userId);
        users.set(record.userId, user ? { name: user.name, email: user.email } : null);
      }
      const author = users.get(record.userId) ?? null;
      items.push({
        id: record.id,
        category: record.category,
        message: record.message,
        client: record.client,
        createdAt: record.createdAt,
        userName: author?.name ?? null,
        userEmail: author?.email ?? null,
      });
    }
    return { items };
  }

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
