"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "../ui";

const LINKS = [
  { href: "/", label: "Weekend", icon: "sports_score" },
  { href: "/live", label: "Live timing", icon: "timer" },
  { href: "/session/latest", label: "Results", icon: "format_list_numbered", match: "/session" },
  { href: "/championship", label: "Championship", icon: "emoji_events" },
  { href: "/calendar", label: "Calendar", icon: "calendar_month" },
];

const isActive = (pathname: string, link: (typeof LINKS)[number]) =>
  "match" in link && link.match ? pathname.startsWith(link.match) : pathname === link.href;

export function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex h-full items-center gap-0.5">
      {LINKS.map((link) => {
        const active = isActive(pathname, link);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-7 items-center rounded px-2 t-label-caps transition-colors ${
              active ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function NavRail() {
  const pathname = usePathname();
  return (
    <nav className="flex w-full flex-col items-center gap-1">
      {LINKS.map((link) => {
        const active = isActive(pathname, link);
        return (
          <Link
            key={link.href}
            href={link.href}
            title={link.label}
            aria-label={link.label}
            aria-current={active ? "page" : undefined}
            className={`flex h-10 w-10 items-center justify-center rounded transition-colors ${
              active
                ? "bg-surface-container-high text-primary"
                : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            }`}
          >
            <Icon name={link.icon} className="text-[20px]" />
          </Link>
        );
      })}
    </nav>
  );
}
