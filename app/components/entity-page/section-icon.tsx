import {
  BrainIcon,
  CpuIcon,
  PlugsConnectedIcon,
  RobotIcon,
  UserIcon,
  UsersThreeIcon,
  WrenchIcon,
  KeyIcon,
  HardDrivesIcon,
  ClockIcon,
  GearIcon,
  ChartLineIcon,
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
    case "dashboard":
      return <ChartLineIcon {...props} />;
    case "bots":
      return <RobotIcon {...props} />;
    case "adapters":
      return <PlugsConnectedIcon {...props} />;
    case "agents":
      return <BrainIcon {...props} />;
    case "rate_limits":
      return <ClockIcon {...props} />;
    case "providers":
      return <CpuIcon {...props} />;
    case "mcp":
      return <WrenchIcon {...props} />;
    case "users":
      return <UserIcon {...props} />;
    case "groups":
      return <UsersThreeIcon {...props} />;
    case "oauth_clients":
      return <KeyIcon {...props} />;
    case "oauth_authentications":
      return <KeyIcon {...props} />;
    case "sandboxes":
      return <HardDrivesIcon {...props} />;
    case "schedules":
      return <ClockIcon {...props} />;
    case "settings":
      return <GearIcon {...props} />;
  }
}
