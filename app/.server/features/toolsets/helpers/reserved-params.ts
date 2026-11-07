import z from "zod";
import { listOauth } from "~/.server/repository/oauth";
import { t } from "~/.server/i18n";

export namespace ReservedParams {
  export async function getAuthIdSchema(
    organizationId: string,
    principalId?: string,
  ) {
    const oauthClients = await listOauth(organizationId, principalId);
    const authentications = oauthClients.flatMap((client) =>
      client.authentications.map((authentication) => ({
        id: authentication.id,
        label: `${client.name} (${authentication.name})`,
      })),
    );

    return {
      authId: z.literal(authentications.map(({ id }) => id)).meta({
        title: t("server.oauthAuthentication"),
        enumNames: authentications.map(({ label }) => label),
      }),
    };
  }

  export async function getAuthIdOptionalSchema(
    organizationId: string,
    principalId?: string,
  ) {
    const oauthClients = await listOauth(organizationId, principalId);
    const authentications = oauthClients.flatMap((client) =>
      client.authentications.map((authentication) => ({
        id: authentication.id,
        label: `${client.name} (${authentication.name})`,
      })),
    );
    const authenticationIds = authentications.map(({ id }) => id);

    return {
      authId: z
        .literal(authenticationIds)
        .optional()
        .meta({
          title: t("server.oauthAuthentication"),
          enum: authenticationIds,
          enumNames: authentications.map(({ label }) => label),
        }),
    };
  }
}
