import {
  BrainIcon,
  CpuIcon,
  PlugsConnectedIcon,
  RobotIcon,
  UserIcon,
  WrenchIcon,
  KeyIcon,
  HardDrivesIcon,
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
    case "providers":
      return <CpuIcon {...props} />;
    case "mcp":
      return <WrenchIcon {...props} />;
    case "users":
      return <UserIcon {...props} />;
    case "oauth":
      return <KeyIcon {...props} />;
    case "sandboxes":
      return <HardDrivesIcon {...props} />;
  }
}
