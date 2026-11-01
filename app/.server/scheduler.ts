import cron, { type ScheduledTask } from "node-cron";
import {
  getScheduleForExecution,
  listSchedulePatterns,
} from "./repository/schedules";
import { runScheduledPrompt } from "./features/bot";
import { getBotInfo } from "./features/chat-adapter";
import { decryptAdapterEnvs } from "./utils";
import { logger } from "./logger";

const jobs = new Map<
  number,
  { cronParam: string; timezone: string; task: ScheduledTask }
>();
let refreshQueue = Promise.resolve();
let startupPromise: Promise<void> | undefined;

async function refreshJobs() {
  const schedules = await listSchedulePatterns();
  const desired = new Map(
    schedules.map((schedule) => [
      schedule.id,
      { cronParam: schedule.cronParam, timezone: schedule.timezone },
    ]),
  );

  for (const [id, { cronParam, timezone }] of desired) {
    if (!cron.validate(cronParam)) {
      logger.error(`Invalid Cron expression for schedule ${id}: ${cronParam}`);
      const previous = jobs.get(id);
      if (previous) {
        await previous.task.destroy();
        jobs.delete(id);
      }
      continue;
    }

    const previous = jobs.get(id);
    if (previous?.cronParam === cronParam && previous.timezone === timezone)
      continue;
    if (previous) await previous.task.destroy();

    const task = cron.schedule(
      cronParam,
      async () => {
        await executeSchedule(id);
      },
      { name: `chatbot-schedule-${id}`, noOverlap: true, timezone },
    );
    jobs.set(id, { cronParam, timezone, task });
  }

  for (const [id, job] of jobs) {
    if (desired.has(id)) continue;
    await job.task.destroy();
    jobs.delete(id);
  }
}

async function executeSchedule(id: number) {
  try {
    const schedule = await getScheduleForExecution(id);
    if (!schedule) return;

    for (const target of schedule.chatTargets) {
      const link = target.chatbotAdapter;
      if (
        !link ||
        link.chatbot.ownerId !== schedule.ownerId ||
        link.adapter.ownerId !== schedule.ownerId ||
        !link.chatbot.isEnabled ||
        link.chatbot.isDeleted
      )
        continue;

      try {
        const botInfo = await getBotInfo(
          link.adapter.platform,
          link.chatbot.name,
          decryptAdapterEnvs(link.adapter.config),
          link.adapter.authId,
        );
        if (!botInfo)
          throw new Error(`Unsupported adapter: ${link.adapter.platform}`);
        await botInfo.bot.initialize();
        await runScheduledPrompt(
          botInfo.bot,
          link.chatbot.id,
          link.adapter.id,
          link.adapter.platform,
          target.threadId,
          schedule.prompt,
        );
      } catch (error) {
        logger.error(
          `Failed to execute schedule ${id} for thread ${target.threadId}`,
          error,
        );
      }
    }
  } catch (error) {
    logger.error(`Failed to load or execute schedule ${id}`, error);
  }
}

export function refreshCronJobs() {
  const refresh = refreshQueue.then(refreshJobs);
  refreshQueue = refresh.catch(() => undefined);
  return refresh;
}

export function startCronScheduler() {
  if (!startupPromise) {
    startupPromise = refreshCronJobs().catch((error: unknown) => {
      startupPromise = undefined;
      throw error;
    });
  }
  return startupPromise;
}
