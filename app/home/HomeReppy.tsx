import { ReppySays } from "@/components/Reppy";
import ReppyPet from "@/components/ReppyPet";

/** 홈의 리피 한마디: 오늘 학습 전에는 졸린 리피, 학습 후에는 웃는 리피 */
export default function HomeReppy({
  streak,
  studiedToday,
  mode,
}: {
  streak: number;
  studiedToday: boolean;
  mode: "memorize" | "vocab";
}) {
  if (studiedToday) {
    return (
      <ReppySays mood="happy" mascot={<ReppyPet mood="happy" />}>
        <b>오늘도 해냈어요!</b> 연속 <span className="en">{streak}</span>일째예요.
      </ReppySays>
    );
  }
  const how = mode === "vocab" ? "수업 한 번만 하면" : "문장 3번만 연습하면";
  return (
    <ReppySays mood="sleepy" mascot={<ReppyPet mood="sleepy" />}>
      리피가 졸려요…{" "}
      {streak > 0 ? (
        <>
          오늘 {how} <b>{streak + 1}일 연속</b>이에요!
        </>
      ) : (
        <>오늘 {how} 불꽃이 켜져요!</>
      )}
    </ReppySays>
  );
}
