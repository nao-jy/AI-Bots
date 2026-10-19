import {
  BrainIcon,
  CpuIcon,
  PlugsConnectedIcon,
  RobotIcon,
  UserIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import type { EntitySection } from "./types";

export function SectionIcon({
  section,
  size = 18,
}: {
  section: EntitySection;
  size?: number;
}) {
  const props = {
    size,
    weight: "regular" as const,
    "aria-hidden": true as const,
  };

  switch (section) {
    case "bots":
      return <RobotIcon {...props} />;
    case "adapters":
      return <PlugsConnectedIcon {...props} />;
    case "agents":
      return <BrainIcon {...props} />;
    case "models":
      return <CpuIcon {...props} />;
    case "mcp":
      return <WrenchIcon {...props} />;
    case "users":
      return <UserIcon {...props} />;
  }
}
