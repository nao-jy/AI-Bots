import { useLocation } from "react-router";
import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const location = useLocation();
  const locale = i18n.language.startsWith("en") ? "en" : "ja";

  return (
    <form method="post" action="/locale" className="locale-form">
      <input
        type="hidden"
        name="returnTo"
        value={`${location.pathname}${location.search}`}
      />
      <select
        key={locale}
        name="locale"
        aria-label={t("language.label")}
        defaultValue={locale}
        onChange={(event) => {
          event.currentTarget.form?.requestSubmit();
        }}
      >
        <option value="ja">{t("language.japanese")}</option>
        <option value="en">{t("language.english")}</option>
      </select>
    </form>
  );
}
