import { Button, Text, Title } from "@mantine/core";
import { PlusIcon } from "@phosphor-icons/react";

export function EntityPageHeader({
  title,
  description,
  onCreate,
}: {
  title: string;
  description: string;
  onCreate: () => void;
}) {
  return (
    <div className="page-heading">
      <div>
        <Title order={1}>{title}</Title>
        <Text>{description}</Text>
      </div>
      <Button
        className="primary-button"
        onClick={onCreate}
        leftSection={<PlusIcon size={16} weight="bold" aria-hidden="true" />}
      >
        {title}を追加
      </Button>
    </div>
  );
}
