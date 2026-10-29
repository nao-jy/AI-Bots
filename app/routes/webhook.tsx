import type { Route } from "./+types/webhook";
import { registerBotHandlers } from "../.server/features/bot";
import { getBotInfo } from "../.server/features/chat-adapter";
import { decryptAdapterEnvs } from "../.server/utils";
import { getAvailableBotByPublicId } from "~/.server/repository/bots";

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const { botId, adapterId } = params;
  if (!botId || !adapterId) {
    return new Response("Not Found", { status: 404 });
  }

  const chatbot = await getAvailableBotByPublicId(botId);

  const adapter = chatbot?.adapters.find(
    (link) =>
      link.adapter?.publicIds.some((publicId) => publicId.id === adapterId) ??
      false,
  )?.adapter;
  if (!chatbot || !adapter) {
    return new Response("Not Found", { status: 404 });
  }

  const botInfo = await getBotInfo(
    adapter.platform,
    chatbot.name,
    decryptAdapterEnvs(adapter.config),
    adapter.authId,
  );
  if (!botInfo) {
    return new Response("Unsupported adapter", { status: 404 });
  }

  registerBotHandlers(botInfo.bot, chatbot.id, adapter.id);
  return botInfo.bot.webhooks[adapter.platform](request, {
    waitUntil: (task) => {
      void task.catch((error) => {
        console.error(
          `Failed to process webhook for chatbot ${chatbot.id}`,
          error,
        );
      });
    },
  });
}
