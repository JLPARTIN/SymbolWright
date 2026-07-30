import type { MissionService } from '../mission/mission-service.js'
import type { GovernedEgressResult } from './governed-egress.js'

export function recordEgressMissionEvidence(
  service: MissionService,
  missionId: string,
  result: GovernedEgressResult,
): void {
  service.appendEvent(
    missionId,
    result.status === 'completed' ? 'sandbox.egress.completed' : 'sandbox.egress.blocked',
    `Governed egress ${result.status}: ${result.decisionCode}.`,
    {
      status: result.status,
      decisionCode: result.decisionCode,
      destinationHostname: result.destinationHostname,
      destinationPathHash: result.destinationPathHash,
      ...(result.policyReference === undefined ? {} : { policy: result.policyReference }),
      ...(result.response === undefined
        ? {}
        : {
            statusCode: result.response.statusCode,
            requestCount: result.response.requestCount,
            bytesSent: result.response.bytesSent,
            bytesReceived: result.response.bytesReceived,
            bodySha256: result.bodySha256,
            bodyTruncated: result.bodyTruncated,
          }),
    },
  )
}
