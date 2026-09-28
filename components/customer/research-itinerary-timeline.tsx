import type { ReactNode } from "react";

import type { ResearchResponse } from "@/lib/application/planner/research-planner";
import styles from "./research-planner-flow.module.css";

export function ResearchItineraryTimeline({
  locale,
  plan,
  renderActions,
}: {
  locale: "vi" | "en";
  plan: Extract<ResearchResponse, { status: "ready" }>["plan"];
  renderActions?: (id: string) => ReactNode;
}) {
  const vi = locale === "vi";
  const money = (value: number) => `${new Intl.NumberFormat("vi-VN").format(value)} VND`;

  return (
    <>
      <p className={styles.returnLeg}>
        <strong>{plan.legs[0]?.departure}</strong> · {vi ? "Điểm hẹn dự kiến: khu Nguyễn Huệ" : "Proposed meeting point: Nguyen Hue area"}
      </p>
      <ol className={styles.timeline}>
        {plan.stops.map((stop, index) => {
          const leg = plan.legs[index];
          return (
            <li key={stop.id}>
              {leg && <p className={styles.transfer}>{leg.departure} → {leg.arrival} · {vi ? "Di chuyển" : "Travel"} {leg.minutes} {vi ? "phút" : "min"} · {money(leg.costVnd)}</p>}
              {stop.waitMinutes > 0 && <p className={styles.wait}>{leg?.arrival} → {stop.arrival} · {vi ? "Chờ đến giờ mở cửa" : "Wait until opening"}: {stop.waitMinutes} {vi ? "phút" : "min"}</p>}
              <article>
                <span className={styles.stopNumber}>{String(index + 1).padStart(2, "0")}</span>
                <p>{stop.arrival} – {stop.departure}</p>
                <h3>{stop.name}</h3>
                <p>{stop.address}</p>
                <p>{stop.durationMinutes} {vi ? "phút tham quan" : "min visit"} · {money(stop.perPersonVnd)} / {vi ? "khách" : "guest"}</p>
                {renderActions?.(stop.id)}
              </article>
            </li>
          );
        })}
      </ol>
      <p className={styles.returnLeg}>{plan.legs.at(-1)?.departure} → {plan.returnTime} · {vi ? "Trở về điểm hẹn" : "Return to meeting point"} · {plan.legs.at(-1)?.minutes ?? 0} {vi ? "phút" : "min"} · {money(plan.legs.at(-1)?.costVnd ?? 0)}</p>
    </>
  );
}
