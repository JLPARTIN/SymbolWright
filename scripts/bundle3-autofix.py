from pathlib import Path


def replace(path_value: str, old: str, new: str) -> None:
    path = Path(path_value)
    text = path.read_text(encoding="utf-8")
    if old in text:
        path.write_text(text.replace(old, new), encoding="utf-8")


replace(
    "src/app/api/mission-routes.ts",
    "import {\n  MissionNotFoundError,\n  MissionRevisionConflictError,\n  MissionService,\n  MissionStateConflictError,\n} from '../../mission/mission-service.js'",
    "import {\n  MissionNotFoundError,\n  MissionRevisionConflictError,\n  MissionStateConflictError,\n} from '../../mission/mission-service.js'\nimport type { MissionService } from '../../mission/mission-service.js'",
)

replace(
    "src/app/shell/repository-mission-bridge.ts",
    "        if (method === 'POST' && /\\/api\\/repository\\/checkpoints\\/[^/]+\\/restore/.test(String(urlValue)) && response.status === 200) {\n          const match = /\\/api\\/repository\\/checkpoints\\/([^/]+)\\/restore/.exec(String(urlValue));\n          if (match && match[1]) await window.codemindRecordMissionEvent({ kind: 'checkpoint-restored', checkpointId: decodeURIComponent(match[1]) });\n        }",
    "        const restorePrefix = '/api/repository/checkpoints/';\n        const restoreSuffix = '/restore';\n        if (method === 'POST' && String(urlValue).startsWith(restorePrefix) && String(urlValue).endsWith(restoreSuffix) && response.status === 200) {\n          const checkpointId = String(urlValue).slice(restorePrefix.length, -restoreSuffix.length);\n          if (checkpointId) await window.codemindRecordMissionEvent({ kind: 'checkpoint-restored', checkpointId: decodeURIComponent(checkpointId) });\n        }",
)

replace(
    "src/server/codemind-chat-server.ts",
    "  MissionNotFoundError,\n  MissionService,\n  MissionStateConflictError,\n",
    "  MissionNotFoundError,\n  MissionService,\n",
)

path = Path("src/app/shell/workspace-agent-bridge.ts")
text = path.read_text(encoding="utf-8")
marker = "    ${buildRepositoryMissionBridgeScript()}"
insertion = """    window.codemindGetScratchMissionState = function () {
      const raw = localStorage.getItem('codemind.workspace.session.v1');
      if (!raw) return {};
      try { return JSON.parse(raw); }
      catch (_) { return {}; }
    };

"""
if insertion not in text:
    path.write_text(text.replace(marker, insertion + marker), encoding="utf-8")

replace(
    "src/mission/mission-service.ts",
    "    const terminal = evidence.status === 'passed' ? 'completed' : evidence.status\n",
    "    const terminal =\n      evidence.status === 'running'\n        ? 'started'\n        : evidence.status === 'passed'\n          ? 'completed'\n          : evidence.status\n",
)
