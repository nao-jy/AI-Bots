import { tool, type Tool } from "ai";
import z from "zod";
import type { ToolSetFactory } from ".";
import type { FileHandleReaderMap } from "./helpers/file-handle";
import { t } from "~/.server/i18n";

const API_BASE_URL = "https://api.kingtime.jp/v1.0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.errors)) return undefined;
  const firstError = value.errors.find(isRecord);
  return typeof firstError?.message === "string"
    ? firstError.message
    : undefined;
}

async function getApiData(
  accessToken: string,
  path: string,
  parameters?: Record<string, string>,
): Promise<unknown> {
  const url = new URL(`${API_BASE_URL}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(parameters ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(30_000),
  });
  const responseText = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    if (!response.ok) {
      throw new Error(
        t("server.kingOfTimeApiRequestFailed", {
          0: response.status,
          1: responseText || response.statusText,
        }),
      );
    }
    throw new Error(
      t("server.kingOfTimeApiInvalidJson", { 0: response.status }),
    );
  }

  if (!response.ok) {
    throw new Error(
      t("server.kingOfTimeApiRequestFailed", {
        0: response.status,
        1: getErrorMessage(data) ?? response.statusText,
      }),
    );
  }
  return data;
}

function getMonthRange(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${yearMonth}-01`,
    end: `${yearMonth}-${String(lastDay).padStart(2, "0")}`,
  };
}

const DROP_RECORD = Symbol("drop-record");

function filterEmployeeRecords(
  value: unknown,
  employeeKey: string,
): unknown | typeof DROP_RECORD {
  if (Array.isArray(value)) {
    return value
      .map((item) => filterEmployeeRecords(item, employeeKey))
      .filter((item) => item !== DROP_RECORD);
  }
  if (!isRecord(value)) return value;
  if (
    typeof value.employeeKey === "string" &&
    value.employeeKey !== employeeKey
  ) {
    return DROP_RECORD;
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(
        ([key, item]) =>
          [key, filterEmployeeRecords(item, employeeKey)] as const,
      )
      .filter(([, item]) => item !== DROP_RECORD),
  );
}

function makeReadableValues(value: unknown): unknown {
  if (value === "no_selected") return t("server.unselected");
  if (Array.isArray(value)) return value.map(makeReadableValues);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, makeReadableValues(item)]),
  );
}

function normalizeEmployeeName(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase();
}

function makeEmployeeMonthTool<
  TSchema extends z.ZodObject<{
    employeeKey: z.ZodString;
    yearMonth: z.ZodString;
  }>,
>(
  accessToken: string,
  inputSchema: TSchema,
  description: string,
  getRequest: (
    employeeKey: string,
    yearMonth: string,
  ) => { path: string; parameters?: Record<string, string> },
): Tool {
  return tool({
    description,
    inputSchema,
    execute: async ({ employeeKey, yearMonth }) => {
      try {
        const { path, parameters } = getRequest(employeeKey, yearMonth);
        const data = await getApiData(accessToken, path, parameters);
        const employeeData = filterEmployeeRecords(data, employeeKey);
        return {
          employeeKey,
          yearMonth,
          data: makeReadableValues(
            employeeData === DROP_RECORD ? null : employeeData,
          ),
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  });
}

export async function getToolSetFactory(userId: number) {
  const contextSchema = z.object({
    apiKey: z.string().min(1).meta({ title: t("server.kingOfTimeApiKey") }),
  });
  const yearMonthSchema = z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .describe(t("server.targetMonth"));
  const employeeMonthSchema = z.object({
    employeeKey: z.string().min(1).describe(t("server.employeeKey")),
    yearMonth: yearMonthSchema,
  });
  const ret: ToolSetFactory = {
    name: "king-of-time",
    displayName: t("server.kingOfTimeAttendance"),
    getToolSetContextSchema: () => contextSchema.toJSONSchema({ target: "draft-7" }),
    validateContext: (value: unknown) => contextSchema.validate(value),
    getTools: async (_fileHandles: FileHandleReaderMap, context: unknown) => {
      const args = contextSchema.parse(context);
      return {
        [`searchKingOfTimeEmployees`]: tool({
          description: t("server.kingOfTimeSearchEmployeeDescription"),
          inputSchema: z.object({
            employeeName: z
              .string()
              .trim()
              .min(1)
              .describe(t("server.kingOfTimeEmployeeName")),
            yearMonth: yearMonthSchema,
          }),
          execute: async ({ employeeName, yearMonth }) => {
            try {
              const data = await getApiData(args.apiKey, "/employees", {
                date: `${yearMonth}-01`,
                includeResigner: "true",
              });
              const employees = Array.isArray(data)
                ? data
                : isRecord(data) && Array.isArray(data.employees)
                  ? data.employees
                  : null;
              if (!employees) {
                throw new Error(
                  t("server.kingOfTimeUnexpectedEmployeeList"),
                );
              }

              const searchName = normalizeEmployeeName(employeeName);
              const matches = employees.flatMap((employee) => {
                if (!isRecord(employee)) return [];
                const lastName =
                  typeof employee.lastName === "string"
                    ? employee.lastName
                    : "";
                const firstName =
                  typeof employee.firstName === "string"
                    ? employee.firstName
                    : "";
                const fullName = `${lastName}${firstName}`;
                if (!normalizeEmployeeName(fullName).includes(searchName)) {
                  return [];
                }
                if (typeof employee.employeeKey !== "string") {
                  throw new Error(
                    t("server.kingOfTimeEmployeeKeyMissing"),
                  );
                }
                return [
                  {
                    employeeKey: employee.employeeKey,
                    employeeCode:
                      typeof employee.code === "string" ? employee.code : null,
                    name: `${lastName} ${firstName}`.trim(),
                    division:
                      typeof employee.divisionName === "string"
                        ? employee.divisionName
                        : null,
                    employmentType:
                      typeof employee.typeName === "string"
                        ? employee.typeName
                        : null,
                  },
                ];
              });

              return {
                yearMonth,
                matches,
                sameNameCandidates:
                  new Set(
                    matches.map(({ name }) => normalizeEmployeeName(name)),
                  ).size < matches.length,
              };
            } catch (e) {
              return { error: e instanceof Error ? e.message : String(e) };
            }
          },
        }),
        [`getKingOfTimeDailyAttendance`]: makeEmployeeMonthTool(
          args.apiKey,
          employeeMonthSchema,
          t("server.kingOfTimeDailyAttendanceDescription"),
          (_employeeKey, yearMonth) => ({
            path: "/daily-workings",
            parameters: getMonthRange(yearMonth),
          }),
        ),
        [`getKingOfTimeDailyTimeRecords`]: makeEmployeeMonthTool(
          args.apiKey,
          employeeMonthSchema,
          t("server.kingOfTimeDailyTimeClockDescription"),
          (employeeKey, yearMonth) => ({
            path: "/daily-workings/timerecord",
            parameters: {
              employeeKeys: employeeKey,
              ...getMonthRange(yearMonth),
            },
          }),
        ),
        [`getKingOfTimeMonthlyAttendance`]: makeEmployeeMonthTool(
          args.apiKey,
          employeeMonthSchema,
          t("server.kingOfTimeMonthlyAttendanceDescription"),
          (_employeeKey, yearMonth) => ({
            path: `/monthly-workings/${yearMonth}`,
          }),
        ),
        [`getKingOfTimeDailySchedules`]: makeEmployeeMonthTool(
          args.apiKey,
          employeeMonthSchema,
          t("server.kingOfTimeDailyScheduleDescription"),
          (_employeeKey, yearMonth) => ({
            path: "/daily-schedules",
            parameters: getMonthRange(yearMonth),
          }),
        ),
        [`listKingOfTimeHolidayTypes`]: tool({
          description: t("server.kingOfTimeLeaveTypesDescription"),
          inputSchema: z.object({}),
          execute: async () => {
            try {
              const data = await getApiData(args.apiKey, "/holiday-types");
              if (!Array.isArray(data)) {
                throw new Error(
                  t("server.kingOfTimeUnexpectedHolidayTypes"),
                );
              }
              return makeReadableValues(data);
            } catch (e) {
              return { error: e instanceof Error ? e.message : String(e) };
            }
          },
        }),
      };
    },
  };
  return ret;
}
