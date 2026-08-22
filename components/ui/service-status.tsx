export const SERVICE_STATUS_STATES = [
  "available",
  "degraded",
  "unavailable",
] as const;

export type ServiceStatusState = (typeof SERVICE_STATUS_STATES)[number];

export type ServiceStatusProps = {
  state: ServiceStatusState;
  labels?: Record<ServiceStatusState, string>;
  label?: string;
};

export function ServiceStatus({
  state,
  labels,
  label,
}: ServiceStatusProps) {
  const visibleLabel = label ?? labels?.[state] ?? state;
  const isAnnounced = state !== "available";

  return (
    <span
      className={`service-status service-status--${state}`}
      data-state={state}
      role={isAnnounced ? "status" : undefined}
    >
      <span
        aria-hidden="true"
        className="service-status__icon"
        data-testid="service-status-icon"
      >
        ●
      </span>
      <span>{visibleLabel}</span>
    </span>
  );
}
