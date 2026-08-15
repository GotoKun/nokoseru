import Link from "next/link";

// 「話す」「見る」はページ上部の役割カードが担うため、ここには載せない。
// ここに残す機能は現時点のカエルムUI仕様書には無いが、後で使えるように残してある付随機能。
const LINKS = [
  { href: "/photos", label: "写真のカラー化" },
  { href: "/export", label: "エクスポート" },
  { href: "/edit", label: "プロフィールを編集" },
];

export function PersonNav({ personId, active }: { personId: string; active: string }) {
  return (
    <nav className="flex flex-wrap gap-2 mt-6">
      {LINKS.map((l) => {
        const isActive = l.href === active;
        return (
          <Link
            key={l.href}
            href={`/persons/${personId}${l.href}`}
            className={`rounded-full px-4 py-1.5 text-sm border ${
              isActive
                ? "bg-accent text-white border-accent"
                : "border-border text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
