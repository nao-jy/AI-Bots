import {
  Alert,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

type ScheduleTarget = {
  chatbotAdapterId: number;
  threadId: string;
  label?: string;
};

type ScheduleRecord = {
  id: number;
  prompt: string;
  cronParam: string;
  targets: ScheduleTarget[];
};

type TargetOption = { label: string; value: string };
type ActionResult = {
  ok?: boolean;
  error?: string;
  intent?: string;
  message?: string;
};

function ScheduleEditor({
  record,
  targetOptions,
  opened,
  onClose,
}: {
  record: ScheduleRecord | null;
  targetOptions: TargetOption[];
  opened: boolean;
  onClose: () => void;
}) {
  const fetcher = useFetcher<ActionResult>();
  const [targets, setTargets] = useState<ScheduleTarget[]>(() =>
    record?.targets.map(({ chatbotAdapterId, threadId }) => ({
      chatbotAdapterId,
      threadId,
    })) ?? [{ chatbotAdapterId: 0, threadId: "" }],
  );

  useEffect(() => {
    if (
      opened &&
      fetcher.state === "idle" &&
      fetcher.data?.ok &&
      !fetcher.data.message
    )
      onClose();
  }, [fetcher.data, fetcher.state, onClose, opened]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Title order={3}>
          {record ? "スケジュールを編集" : "スケジュールを作成"}
        </Title>
      }
      centered
      size="lg"
      radius="lg"
    >
      <fetcher.Form method="post" key={`${record?.id ?? "new"}`}>
        <input
          type="hidden"
          name="_intent"
          value={record ? "update" : "create"}
        />
        {record && <input type="hidden" name="id" value={record.id} />}
        <input type="hidden" name="targets" value={JSON.stringify(targets)} />
        <Stack gap="md">
          <Textarea
            name="prompt"
            label="プロンプト"
            placeholder="定期実行時にボットへ入力する内容"
            minRows={4}
            defaultValue={record?.prompt ?? ""}
            required
          />
          <TextInput
            name="cronParam"
            label="Cron式"
            placeholder="例: 0 9 * * 1-5"
            defaultValue={record?.cronParam ?? ""}
            required
          />
          <Text size="xs" c="dimmed">
            5項目または秒を含む6項目で指定します。実行時刻はサーバーのタイムゾーンに従います。
          </Text>

          <div>
            <Text size="sm" fw={500} mb="xs">
              送信先
            </Text>
            <Stack gap="xs">
              {targets.map((target, index) => (
                <Group key={index} align="flex-end" wrap="nowrap">
                  <Select
                    label={index === 0 ? "ボット / アダプタ" : undefined}
                    placeholder="送信先を選択"
                    data={targetOptions}
                    value={
                      target.chatbotAdapterId
                        ? String(target.chatbotAdapterId)
                        : null
                    }
                    onChange={(value) =>
                      setTargets((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                chatbotAdapterId: value ? Number(value) : 0,
                              }
                            : item,
                        ),
                      )
                    }
                    searchable
                    style={{ flex: 1 }}
                    required
                  />
                  <TextInput
                    label={index === 0 ? "スレッドID" : undefined}
                    placeholder="例: slack:C123:1234567890.123456"
                    value={target.threadId}
                    onChange={(event) => {
                      const threadId = event.currentTarget.value;
                      setTargets((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, threadId } : item,
                        ),
                      );
                    }}
                    style={{ flex: 1 }}
                    required
                  />
                  <Button
                    type="button"
                    variant="subtle"
                    color="red"
                    aria-label={`送信先 ${index + 1} を削除`}
                    onClick={() =>
                      setTargets((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <TrashIcon size={16} aria-hidden="true" />
                  </Button>
                </Group>
              ))}
            </Stack>
            <Button
              type="button"
              variant="light"
              size="xs"
              mt="sm"
              leftSection={<PlusIcon size={14} aria-hidden="true" />}
              onClick={() =>
                setTargets((current) => [
                  ...current,
                  { chatbotAdapterId: 0, threadId: "" },
                ])
              }
            >
              送信先を追加
            </Button>
            {targetOptions.length === 0 && (
              <Text size="xs" c="dimmed" mt="xs">
                ボットとアダプタの組み合わせがありません。
              </Text>
            )}
          </div>

          {fetcher.data?.error && (
            <Alert color="red" role="status">
              {fetcher.data.error}
            </Alert>
          )}
          {fetcher.data?.message && (
            <Alert color="yellow" role="status">
              {fetcher.data.message}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" type="button" onClick={onClose}>
              キャンセル
            </Button>
            <Button
              type="submit"
              className="primary-button"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle" ? "保存中..." : "保存"}
            </Button>
          </Group>
        </Stack>
      </fetcher.Form>
    </Modal>
  );
}

export function SchedulesPage({
  records,
  targetOptions,
  selectedId,
  editorOpened,
  deleteId,
  onCreate,
  onEdit,
  onDelete,
  onCloseEditor,
  onCloseDelete,
}: {
  records: ScheduleRecord[];
  targetOptions: TargetOption[];
  selectedId: number | null;
  editorOpened: boolean;
  deleteId: number | null;
  onCreate: () => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onCloseEditor: () => void;
  onCloseDelete: () => void;
}) {
  const deleteFetcher = useFetcher<ActionResult>();
  const selected = records.find((record) => record.id === selectedId) ?? null;
  const deleting = records.find((record) => record.id === deleteId) ?? null;

  useEffect(() => {
    if (
      deleteFetcher.state !== "idle" ||
      !deleteFetcher.data?.ok ||
      deleteFetcher.data.message
    )
      return;
    onCloseDelete();
  }, [deleteFetcher.data, deleteFetcher.state, onCloseDelete]);

  return (
    <div className="entity-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKSPACE SETTINGS</div>
          <Title order={1}>スケジュール</Title>
          <Text>
            Cron式に従って指定したスレッドでボットを実行します。
          </Text>
        </div>
        <Button
          className="primary-button"
          onClick={onCreate}
          leftSection={<PlusIcon size={16} weight="bold" aria-hidden="true" />}
        >
          スケジュールを追加
        </Button>
      </div>

      <Paper withBorder radius="md" p={0} style={{ overflowX: "auto" }}>
        <Table striped highlightOnHover miw={760}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>プロンプト</Table.Th>
              <Table.Th>Cron式</Table.Th>
              <Table.Th>送信先</Table.Th>
              <Table.Th aria-label="操作" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {records.map((record) => (
              <Table.Tr key={record.id}>
                <Table.Td style={{ maxWidth: 360, whiteSpace: "pre-wrap" }}>
                  {record.prompt}
                </Table.Td>
                <Table.Td>
                  <Text component="code" size="sm">
                    {record.cronParam}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Stack gap={4}>
                    {record.targets.map((target, index) => (
                      <Text key={`${target.chatbotAdapterId}-${target.threadId}-${index}`} size="sm">
                        {target.label} / {target.threadId}
                      </Text>
                    ))}
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" wrap="nowrap">
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => onEdit(record.id)}
                    >
                      編集
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="red"
                      onClick={() => {
                        onDelete(record.id);
                      }}
                    >
                      削除
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {records.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text ta="center" c="dimmed" py="lg">
                    スケジュールはまだありません。
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Paper>

      <ScheduleEditor
        key={`${selected?.id ?? "new"}-${editorOpened}`}
        record={selected}
        targetOptions={targetOptions}
        opened={editorOpened}
        onClose={onCloseEditor}
      />

      <Modal
        opened={deleteId !== null}
        onClose={onCloseDelete}
        title="スケジュールを削除"
        centered
        size="sm"
      >
        <Text>
          {deleting ? `「${deleting.cronParam}」のスケジュールを削除しますか？` : ""}
        </Text>
        {deleteFetcher.data?.error && (
          <Alert color="red" mt="md">
            {deleteFetcher.data.error}
          </Alert>
        )}
        {deleteFetcher.data?.message && (
          <Alert color="yellow" mt="md">
            {deleteFetcher.data.message}
          </Alert>
        )}
        <deleteFetcher.Form method="post">
          <input type="hidden" name="_intent" value="delete" />
          {deleteId !== null && (
            <input type="hidden" name="id" value={deleteId} />
          )}
          <Group justify="flex-end" mt="lg">
            <Button variant="default" type="button" onClick={onCloseDelete}>
              キャンセル
            </Button>
            <Button
              color="red"
              type="submit"
              disabled={deleteFetcher.state !== "idle"}
            >
              {deleteFetcher.state !== "idle" ? "削除中..." : "削除する"}
            </Button>
          </Group>
        </deleteFetcher.Form>
      </Modal>
    </div>
  );
}
