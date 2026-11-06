import { useEffect, useState } from "react";
import { PasswordInput, Progress, Text } from "@mantine/core";
import type { PasswordInputProps } from "@mantine/core";
import { t } from "~/i18n";

type PasswordStrengthInputProps = PasswordInputProps & {
  minimumStrength?: number;
};

export function PasswordStrengthInput({
  minimumStrength = 0,
  ...props
}: PasswordStrengthInputProps) {
  const [password, setPassword] = useState("");
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    if (!password) {
      setScore(null);
      return () => {
        active = false;
      };
    }

    void import("../password-strength").then(({ getPasswordStrength }) => {
      if (active) setScore(getPasswordStrength(password));
    });
    return () => {
      active = false;
    };
  }, [password]);

  const levels = [
    t("components.passwordStrength.veryWeak"),
    t("components.passwordStrength.weak"),
    t("components.passwordStrength.fair"),
    t("components.passwordStrength.strong"),
    t("components.passwordStrength.veryStrong"),
  ];

  return (
    <>
      <PasswordInput {...props} onChange={(event) => setPassword(event.currentTarget.value)} />
      {(score !== null || minimumStrength > 0) && (
        <div aria-live="polite" aria-atomic="true">
          {score !== null && (
            <Text size="xs" mt={4}>
              {t("components.passwordStrength.label")}: {levels[score]}
            </Text>
          )}
          <Text
            size="xs"
            c={score !== null && score < minimumStrength ? "red" : "dimmed"}
          >
            {t("components.passwordStrength.minimum", {
              strength: levels[minimumStrength],
            })}
          </Text>
          {score !== null && (
            <Progress
              value={((score + 1) / 5) * 100}
              color={score < 2 ? "red" : score < 4 ? "yellow" : "green"}
              size="sm"
              aria-label={`${t("components.passwordStrength.label")}: ${levels[score]}`}
            />
          )}
        </div>
      )}
    </>
  );
}
