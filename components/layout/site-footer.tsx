import type { Locale } from "@/lib/i18n/config";

export type SiteFooterProps = {
  locale: Locale;
  labels: {
    summary: string;
    copyright: string;
  };
};

export function SiteFooter({ labels }: SiteFooterProps) {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p>{labels.summary}</p>
        <p>{labels.copyright}</p>
      </div>
    </footer>
  );
}
