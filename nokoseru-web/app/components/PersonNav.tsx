import Link from "next/link";

const LINKS = [
  { href: "", label: "概要" },
  { href: "/record", label: "収録する" },
  { href: "/search", label: "見る・探す" },
  { href: "/photos", label: "写真のカラー化" },
  { href: "/export", label: "エクスポート" },
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
