import cron, { type ScheduledTask } from "node-cron";
import {
  getScheduleForExecution,
  listSchedulePatterns,
} from "../repository/schedules";
import { runScheduledPrompt } from "./bot";
import { getBotInfo } from "./chat-adapter";
import { decryptAdapterEnvs } from "../utils";
import { appLogger } from "../logger/app-logger";
import { beginExecution, finishExecution } from "../repository/executions";

const jobs = new Map<
  string,
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
      appLogger.error(
        `Invalid Cron expression for schedule ${id}: ${cronParam}`,
      );
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

async function executeSchedule(id: string) {
  try {
    const schedule = await getScheduleForExecution(id);
    if (!schedule) return;

    for (const target of schedule.chatTargets) {
      const link = target.chatbotAdapter;
      if (
        !link ||
        link.chatbot.organizationId !== schedule.organizationId ||
        link.adapter.organizationId !== schedule.organizationId
      )
        continue;

      const executionId = await beginExecution({
        organizationId: schedule.organizationId,
        chatbotId: link.chatbot.id,
        agentId: link.chatbot.agentId,
        adapterId: link.adapter.id,
        scheduleId: id,
        source: "schedule",
        threadId: target.threadId,
      });
      if (!link.chatbot.isEnabled) {
        await finishExecution(executionId, {
          status: "skipped",
          errorCode: "bot_disabled",
        });
        continue;
      }

      let initialized = false;
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
        initialized = true;
        const outcome = await runScheduledPrompt(
          botInfo.bot,
          link.chatbot.id,
          link.adapter.id,
          link.adapter.platform,
          target.threadId,
          schedule.prompt,
          executionId,
        );
        if (outcome.status === "failed") {
          appLogger.warn(
            `Schedule ${id} failed for thread ${target.threadId} (execution ${executionId ?? "unrecorded"}, reason ${outcome.errorCode ?? "unknown"})`,
          );
        }
      } catch (error) {
        appLogger.error(
          `Failed to execute schedule ${id} for thread ${target.threadId} (execution ${executionId ?? "unrecorded"})`,
          error,
        );
        await finishExecution(executionId, {
          status: "failed",
          errorCode: initialized ? "processing_error" : "adapter_error",
        });
      }
    }
  } catch (error) {
    appLogger.error(`Failed to load or execute schedule ${id}`, error);
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
