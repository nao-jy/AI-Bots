import z from "zod";

// for toolset
export const RESERVED_AUTH_ID = {
  authId: z.number().nullable().describe("authentication id"),
};
