import { useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  PasswordInput,
  Select,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { useFetcher } from "react-router";
import type { EntityRecord } from "../.server/mock-entities";

export type EntityField = {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "email" | "textarea" | "select" | "password";
  options?: string[];
  wide?: boolean;
};

export type EntitySection = "bots" | "adapters" | "agents" | "mcp" | "users";

export type EntityPageDefinition = {
  title: string;
  description: string;
  icon: EntitySection;
  columns: { key: string; label: string }[];
  fields: EntityField[];
  records: EntityRecord[];
};

export function EntityPageView({ page }: { page: EntityPageDefinition }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"create" | "edit" | "delete" | null>(null);
  const [selected, setSelected] = useState<EntityRecord | null>(null);
  const visibleRecords = page.records.filter((record) => Object.values(record).join(" ").toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      setDialog(null);
      setSelected(null);
    }
  }, [fetcher.state, fetcher.data]);

  function openEdit(record: EntityRecord) {
    setSelected(record);
    setDialog("edit");
  }

  return (
    <div className="entity-page">
      <div className="page-heading">
        <div><div className="eyebrow">WORKSPACE SETTINGS</div><Title order={1}>{page.title}</Title><Text>{page.description}</Text></div>
        <Button className="primary-button" onClick={() => { setSelected(null); setDialog("create"); }} leftSection={<span className="button-plus">＋</span>}>{page.title}を追加</Button>
      </div>

      <section className="entity-panel">
        <div className="entity-toolbar"><TextInput className="search-field" placeholder={`${page.title}を検索...`} value={query} onChange={(event) => setQuery(event.currentTarget.value)} leftSection={<span className="search-icon">⌕</span>} aria-label={`${page.title}を検索`}/><span className="record-count">{page.records.length} 件</span></div>
        <div className="table-wrap"><Table className="entity-table" verticalSpacing="md" horizontalSpacing="md"><Table.Thead><Table.Tr>{page.columns.map((column) => <Table.Th key={column.key}>{column.label}</Table.Th>)}<Table.Th className="actions-header">操作</Table.Th></Table.Tr></Table.Thead><Table.Tbody>
          {visibleRecords.map((record) => <Table.Tr key={record.id}><Table.Td><div className="entity-name-cell"><span className={`entity-symbol ${page.icon}`}>{page.icon === "bots" ? "◈" : page.icon === "adapters" ? "⌘" : page.icon === "agents" ? "✳" : page.icon === "mcp" ? "⌬" : "♙"}</span><div><strong>{record[page.columns[0].key] ?? "名称未設定"}</strong>{(page.icon === "bots" || page.icon === "mcp") && <small>{record.description ?? record.endpoint ?? ""}</small>}</div></div></Table.Td>
            {page.columns.slice(1).map((column) => <Table.Td key={column.key}>{column.key === "status" ? <Status value={String(record[column.key] ?? "")}/> : column.key === "provider" ? <span className="provider-pill"><span className="provider-dot">{String(record[column.key] ?? "").slice(0, 1)}</span>{record[column.key]}</span> : <span className={column.key === "endpoint" ? "mono" : "table-text"}>{record[column.key] ?? "—"}</span>}</Table.Td>)}
            <Table.Td><Group gap={5} justify="flex-end"><ActionIcon variant="subtle" color="gray" aria-label={`${record[page.columns[0].key]}を編集`} onClick={() => openEdit(record)}>✎</ActionIcon><ActionIcon variant="subtle" color="gray" aria-label={`${record[page.columns[0].key]}を削除`} onClick={() => { setSelected(record); setDialog("delete"); }}>⌫</ActionIcon></Group></Table.Td>
          </Table.Tr>)}
          {visibleRecords.length === 0 && <Table.Tr><Table.Td colSpan={page.columns.length + 1}><div className="empty-state"><span>⌕</span><strong>該当するデータがありません</strong><small>検索条件を変えるか、新しく作成してください。</small></div></Table.Td></Table.Tr>}
        </Table.Tbody></Table></div>
        <div className="table-footer"><span>{visibleRecords.length} 件中 <strong>1–{visibleRecords.length}</strong> 件を表示</span></div>
      </section>

      <Modal opened={dialog === "create" || dialog === "edit"} onClose={() => setDialog(null)} title={<div><Text className="modal-kicker">{dialog === "edit" ? "設定を更新" : "新しい設定"}</Text><Title order={3}>{dialog === "edit" ? `${page.title}を編集` : `${page.title}を作成`}</Title></div>} centered size="lg" radius="lg" classNames={{ title: "editor-modal-title", content: "editor-modal-content" }}>
        <fetcher.Form method="post" key={`${dialog}-${selected?.id ?? "new"}`}>
          <input type="hidden" name="_intent" value={dialog === "edit" ? "update" : "create"}/>
          {selected && <input type="hidden" name="id" value={selected.id}/>}
          <Text className="modal-intro">{page.description} 必要な情報を入力してください。</Text>
          {fetcher.data?.error && <Alert color="red" mb="md">{fetcher.data.error}</Alert>}
          <div className="form-grid">{page.fields.map((field) => <div className={field.wide ? "field-wide" : ""} key={field.key}>
            {field.type === "textarea" ? <Textarea name={field.key} label={field.label} placeholder={field.placeholder} minRows={3} defaultValue={String(selected?.[field.key] ?? "")}/> : field.type === "select" ? <Select name={field.key} label={field.label} placeholder="選択してください" data={field.options ?? []} defaultValue={String(selected?.[field.key] ?? "") || null}/> : field.type === "password" ? <PasswordInput name={field.key} label={field.label} placeholder={field.placeholder} autoComplete="new-password"/> : <TextInput name={field.key} type={field.type === "email" ? "email" : "text"} label={field.label} placeholder={field.placeholder} defaultValue={String(selected?.[field.key] ?? "")}/ >}
          </div>)}</div>
          <div className="modal-actions"><Button variant="default" type="button" onClick={() => setDialog(null)}>キャンセル</Button><Button type="submit" className="primary-button" disabled={fetcher.state !== "idle"}>{fetcher.state !== "idle" ? "保存中..." : dialog === "edit" ? "変更を保存" : "作成する"}</Button></div>
        </fetcher.Form>
      </Modal>

      <Modal opened={dialog === "delete"} onClose={() => setDialog(null)} title="削除の確認" centered size="sm" radius="lg">
        <Text className="delete-copy">「{selected?.[page.columns[0].key]}」を削除します。この操作は取り消せません。</Text>
        {fetcher.data?.error && <Alert color="red" mt="md">{fetcher.data.error}</Alert>}
        <fetcher.Form method="post"><input type="hidden" name="_intent" value="delete"/>{selected && <input type="hidden" name="id" value={selected.id}/>}<div className="modal-actions"><Button variant="default" type="button" onClick={() => setDialog(null)}>キャンセル</Button><Button type="submit" color="red" disabled={fetcher.state !== "idle"}>{fetcher.state !== "idle" ? "削除中..." : "削除する"}</Button></div></fetcher.Form>
      </Modal>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const active = ["稼働中", "接続済み", "有効"].includes(value);
  const pending = ["招待中", "未接続"].includes(value);
  return <Badge className={`status-badge ${active ? "success" : pending ? "pending" : "muted"}`} variant="light" radius="sm" leftSection={<span className="status-dot"/>}>{value}</Badge>;
}
