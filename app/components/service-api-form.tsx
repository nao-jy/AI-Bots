import { useEffect, useState } from "react";
import { Alert, Button, Input, Switch, Text, TextInput } from "@mantine/core";
import RjsfForm from "@rjsf/mantine";
import validator from "@rjsf/validator-ajv8";
import type { RJSFSchema } from "@rjsf/utils";
import { useFetcher } from "react-router";
import { t } from "~/i18n";
import { KeyValueEditor } from "~/components/entity-page/dialogs";
import { contextUiSchema } from "~/components/entity-page/mcp-server-editor";
import type { action } from "~/routes/service-apis";

export function ServiceApiForm({
  kind,
  api,
  onSaved,
  onCancel,
}: {
  kind: "sandbox" | "filesystem";
  api?: { id: string; name: string; endpoint: string };
  onSaved: () => void;
  onCancel: () => void;
}) {
  const saveFetcher = useFetcher<typeof action>();
  const fetcher = useFetcher<typeof action>();
  const testFetcher = useFetcher<typeof action>();
  const [replaceHeaders, setReplaceHeaders] = useState(!api);
  const [replaceContext, setReplaceContext] = useState(!api);
  const [schema, setSchema] = useState<RJSFSchema | null>(null);
  const [context, setContext] = useState<Record<string, unknown>>({});
  const [schemaError, setSchemaError] = useState(false);
  const [contextError, setContextError] = useState(false);
  const [showTestResult, setShowTestResult] = useState(false);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if ("schema" in fetcher.data && fetcher.data.schema) {
      setSchema(fetcher.data.schema);
      setSchemaError(false);
    } else if ("schemaError" in fetcher.data) {
      setSchema(null);
      setSchemaError(true);
    }
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    if (
      saveFetcher.state === "idle" &&
      saveFetcher.data &&
      "ok" in saveFetcher.data &&
      saveFetcher.data.ok
    )
      onSaved();
  }, [saveFetcher.state, saveFetcher.data, onSaved]);

  return (
    <saveFetcher.Form
      method="post"
      onChange={() => setShowTestResult(false)}
      onSubmit={(event) => {
        if (
          kind === "filesystem" &&
          replaceContext &&
          (!schema || !validator.isValid(schema, context, schema))
        ) {
          event.preventDefault();
          setContextError(true);
        }
      }}
    >
      {saveFetcher.data &&
        "error" in saveFetcher.data &&
        saveFetcher.data.error && (
          <Alert color="red" role="alert" mb="sm">
            {saveFetcher.data.error}
          </Alert>
        )}
      <input type="hidden" name="_intent" value="save-api" />
      <input type="hidden" name="kind" value={kind} />
      {api && <input type="hidden" name="id" value={api.id} />}
      <Text className="modal-intro">{t("pages.serviceApis.description")}</Text>
      <div className="form-grid">
        <div className="field-wide">
          <TextInput
            name="name"
            label={t("pages.settings.apiNameLabel")}
            defaultValue={api?.name}
            required
          />
        </div>
        <div className="field-wide">
          <TextInput
            name="endpoint"
            label={t("pages.settings.apiEndpointLabel")}
            defaultValue={api?.endpoint}
            required
            onChange={() => setSchema(null)}
          />
        </div>
        <div className="field-wide">
          {api && (
            <Switch
              mt="sm"
              label={t("pages.settings.replaceApiHeaders")}
              checked={replaceHeaders}
              onChange={(event) => {
                setReplaceHeaders(event.currentTarget.checked);
                setSchema(null);
              }}
            />
          )}
          {replaceHeaders ? (
            <div onChange={() => setSchema(null)}>
              <KeyValueEditor
                name="headers"
                label={t("pages.settings.apiHeadersLabel")}
                initialValue="{}"
              />
            </div>
          ) : (
            <input type="hidden" name="headers" value="" />
          )}
          {kind === "filesystem" && (
            <>
              {api && (
                <Switch
                  mt="sm"
                  label={t("pages.settings.replaceApiContext")}
                  checked={replaceContext}
                  onChange={(event) =>
                    setReplaceContext(event.currentTarget.checked)
                  }
                />
              )}
              {replaceContext ? (
                <>
                  <Button
                    type="button"
                    variant="light"
                    mt="sm"
                    mr="sm"
                    loading={fetcher.state !== "idle"}
                    onClick={(event) => {
                      const form = event.currentTarget.form;
                      if (!form) return;
                      const data = new FormData(form);
                      data.set("_intent", "load-filesystem-schema");
                      setSchema(null);
                      setSchemaError(false);
                      fetcher.submit(data, { method: "post" });
                    }}
                  >
                    {t("pages.settings.loadApiSchema")}
                  </Button>
                  {schemaError && (
                    <Alert color="red" mt="sm">
                      {t("pages.settings.apiSchemaError")}
                    </Alert>
                  )}
                  {schema && (
                    <>
                      <Input.Label component="div" mt="sm">
                        {t("pages.settings.apiContextLabel")}
                      </Input.Label>
                      <RjsfForm
                        schema={schema}
                        validator={validator}
                        formData={context}
                        onChange={({ formData }) => {
                          setContext(formData ?? {});
                          setContextError(false);
                        }}
                        tagName="div"
                        uiSchema={contextUiSchema(schema)}
                      />
                      {contextError && (
                        <Alert color="red" mt="sm">
                          {t("pages.settings.apiContextInvalid")}
                        </Alert>
                      )}
                      <input
                        type="hidden"
                        name="context"
                        value={JSON.stringify(context)}
                      />
                    </>
                  )}
                </>
              ) : (
                <input type="hidden" name="context" value="" />
              )}
            </>
          )}
        </div>
      </div>
      {showTestResult &&
        testFetcher.state === "idle" &&
        testFetcher.data &&
        "apiTest" in testFetcher.data && (
          <Alert color={testFetcher.data.apiTestOk ? "green" : "red"} mt="sm">
            {t(
              testFetcher.data.apiTestOk
                ? kind === "sandbox"
                  ? "pages.settings.sandboxApiTestSucceeded"
                  : "pages.settings.filesystemApiTestSucceeded"
                : "pages.settings.apiTestFailed",
            )}
          </Alert>
        )}
      <div className="modal-actions service-api-actions">
        <Button variant="default" type="button" onClick={onCancel}>
          {t("pages.serviceApis.cancel")}
        </Button>
        <Button
          type="button"
          variant="light"
          loading={testFetcher.state !== "idle"}
          onClick={(event) => {
            const form = event.currentTarget.form;
            if (!form) return;
            const data = new FormData(form);
            data.set("_intent", "test-api");
            setShowTestResult(true);
            testFetcher.submit(data, { method: "post" });
          }}
        >
          {testFetcher.state !== "idle"
            ? t("components.entityPage.dialogs.testing")
            : t("components.entityPage.dialogs.test")}
        </Button>
        <Button
          type="submit"
          loading={saveFetcher.state !== "idle"}
          disabled={kind === "filesystem" && replaceContext && !schema}
        >
          {t(api ? "pages.settings.save" : "pages.settings.addApi")}
        </Button>
      </div>
    </saveFetcher.Form>
  );
}
