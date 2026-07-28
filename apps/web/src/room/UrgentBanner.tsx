import type { RoomSnapshot } from "../client/types.js";

export function UrgentBanner({
  room,
  onOpenApproval,
  onOpenDriver,
}: {
  room: RoomSnapshot;
  onOpenApproval: (approvalId: string) => void;
  onOpenDriver: () => void;
}) {
  const approval = room.pendingApprovals[0];
  const driverRequested = room.driver.state === "requested";

  if (!approval && !driverRequested) return null;

  if (approval) {
    return (
      <div className="urgent-banner" role="status">
        <div>
          <strong>Decision required:</strong> {approval.category} approval — {approval.summary}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onOpenApproval(approval.approvalId)}
        >
          Review
        </button>
      </div>
    );
  }

  return (
    <div className="urgent-banner" role="status">
      <div>
        <strong>Decision required:</strong> Driver handoff requested
      </div>
      <button type="button" className="btn btn-primary" onClick={onOpenDriver}>
        Review
      </button>
    </div>
  );
}
