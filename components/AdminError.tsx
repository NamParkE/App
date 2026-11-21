import Link from "next/link";
import BottomNav from "./BottomNav";
import { BackIcon } from "./Icons";

/** 운영자 메뉴의 DB 함수를 부르지 못했을 때 */
export default function AdminError({ back = "/me" }: { back?: string }) {
  return (
    <main className="screen">
      <div className="pad">
        <div className="topbar">
          <Link href={back} className="icon-btn" aria-label="뒤로">
            <BackIcon />
          </Link>
          <h1>운영자 메뉴</h1>
        </div>
        <p className="notice">
          운영자 정보를 불러오지 못했어요. Supabase SQL Editor에서 <span className="en">0008_admin.sql</span>을 실행했는지 확인해 주세요.
        </p>
      </div>
      <BottomNav current="/me" />
    </main>
  );
}
