import type { AppConfig } from '../config/env';
import type { Storage } from '../storage/types';
import { AdminService } from './admin.service';
import { AuthService } from './auth.service';
import { AiService } from './ai.service';
import { CreditsService } from './credits.service';
import { FeedbackService } from './feedback.service';
import { HistoryService } from './history.service';
import { ProviderRegistry } from './provider-registry';
import { SettingsService } from './settings.service';
import { StatsService } from './stats.service';
import { TranslationService } from './translation.service';
import { UsageService } from './usage.service';
import { UsersService } from './users.service';

export interface Services {
  settings: SettingsService;
  usage: UsageService;
  history: HistoryService;
  registry: ProviderRegistry;
  translation: TranslationService;
  ai: AiService;
  stats: StatsService;
  credits: CreditsService;
  users: UsersService;
  admin: AdminService;
  auth: AuthService;
  feedback: FeedbackService;
}

/**
 * Wires the services together. Each request uses the same instances, so usage writes are serialized.
 * `now` is injectable so tests can pin the clock (day boundaries, credit resets).
 */
export function createServices(
  config: AppConfig,
  storage: Storage,
  encryptionKey: Buffer,
  now?: () => Date,
): Services {
  const settings = new SettingsService(storage, now);
  const usage = new UsageService(storage, now);
  const history = new HistoryService(storage, usage);
  const registry = new ProviderRegistry(storage, usage, config, encryptionKey, now);
  const translation = new TranslationService(registry, settings, history);
  const ai = new AiService(registry, settings, history, translation, storage, now);
  const stats = new StatsService(storage, usage, history, now);
  const credits = new CreditsService(storage, now);
  const users = new UsersService(storage, credits, now);
  const admin = new AdminService(storage, registry, usage, now);
  const auth = new AuthService(config, storage, credits, now);
  const feedback = new FeedbackService(storage, now);
  return { settings, usage, history, registry, translation, ai, stats, credits, users, admin, auth, feedback };
}
