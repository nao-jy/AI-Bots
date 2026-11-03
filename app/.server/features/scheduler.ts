import cron, { type ScheduledTask } from "node-cron";
import {
  getScheduleForExecution,
  listSchedulePatterns,
} from "../repository/schedules";
import { runScheduledPrompt } from "./bot";
import { getBotInfo } from "./chat-adapter";
import { decryptAdapterEnvs } from "../utils";
import { logger } from "../logger";

const jobs = new Map<
  number,
  {
    cronParam: string;
    timezone: string;
    revision: symbol;
    task: ScheduledTask;
  }
>();
type SchedulerState = {
  jobs: typeof jobs;
  refreshQueue: Promise<void>;
  startupRevision: symbol | null;
  startupPromise: Promise<void> | undefined;
};

const globalScheduler = globalThis as typeof globalThis & {
  __botManagerCronScheduler?: SchedulerState;
};
const schedulerState = (globalScheduler.__botManagerCronScheduler ??= {
  jobs,
  refreshQueue: Promise.resolve(),
  startupRevision: null,
  startupPromise: undefined,
});
const moduleRevision = Symbol("scheduler-module-revision");

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
      const previous = schedulerState.jobs.get(id);
      if (previous) {
        await previous.task.destroy();
        schedulerState.jobs.delete(id);
      }
      continue;
    }

    const previous = schedulerState.jobs.get(id);
    if (
      previous?.cronParam === cronParam &&
      previous.timezone === timezone &&
      previous.revision === moduleRevision
    )
      continue;
    if (previous) await previous.task.destroy();

    const task = cron.schedule(
      cronParam,
      async () => {
        await executeSchedule(id);
      },
      { name: `chatbot-schedule-${id}`, noOverlap: true, timezone },
    );
    schedulerState.jobs.set(id, {
      cronParam,
      timezone,
      revision: moduleRevision,
      task,
    });
  }

  for (const [id, job] of schedulerState.jobs) {
    if (desired.has(id)) continue;
    await job.task.destroy();
    schedulerState.jobs.delete(id);
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
  const refresh = schedulerState.refreshQueue.then(refreshJobs);
  schedulerState.refreshQueue = refresh.catch(() => undefined);
  return refresh;
}

export function startCronScheduler() {
  let startupPromise = schedulerState.startupPromise;
  if (schedulerState.startupRevision !== moduleRevision || !startupPromise) {
    schedulerState.startupRevision = moduleRevision;
    startupPromise = refreshCronJobs().catch((error: unknown) => {
      if (schedulerState.startupRevision === moduleRevision) {
        schedulerState.startupRevision = null;
        schedulerState.startupPromise = undefined;
      }
      throw error;
    });
    schedulerState.startupPromise = startupPromise;
  }
  return startupPromise;
}
