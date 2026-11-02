import z from "zod";
import { listOauth } from "~/.server/repository/oauth";

export namespace ReservedParams {
  export async function getAuthIdSchema(ownerId: number) {
    const oauthClients = await listOauth(ownerId);
    const authentications = oauthClients.flatMap((client) =>
      client.authentications.map((authentication) => ({
        id: authentication.id,
        label: `${client.name} (${authentication.name})`,
      })),
    );

    return {
      authId: z
        .literal([null, ...authentications.map(({ id }) => id)])
        .meta({
          title: "OAuth認証情報",
          enumNames: ["未設定", ...authentications.map(({ label }) => label)],
        })
        .describe("OAuth認証情報を選択"),
    };
  }
}
