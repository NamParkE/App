import Link from "next/link";
import { FamilyIcon, HomeIcon, UserIcon } from "./Icons";

const ITEMS = [
  { href: "/home", label: "학습", Icon: HomeIcon },
  { href: "/family", label: "가족", Icon: FamilyIcon },
  { href: "/me", label: "내 정보", Icon: UserIcon },
];

export default function BottomNav({ current }: { current: "/home" | "/family" | "/me" }) {
  return (
    <nav className="nav" aria-label="주 메뉴">
      {ITEMS.map(({ href, label, Icon }) => (
        <Link key={href} href={href} aria-current={href === current ? "page" : undefined}>
          <Icon />
          {label}
        </Link>
      ))}
    </nav>
  );
}
