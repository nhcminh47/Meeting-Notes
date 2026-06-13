import { Badge } from "../atoms/Badge";
import { CatMascot, type MascotState } from "../atoms/CatMascot";

export function AppHeader(props: {
  ready: boolean;
  mascotState: MascotState;
}) {
  return (
    <header className="app-header">
      <div className="app-header__copy">
        <p className="eyebrow">Private, on-device transcription</p>
        <h1>Local Whisper Studio</h1>
        <p>Convert and transcribe audio locally. Files never leave this computer.</p>
        <Badge variant={props.ready ? "ready" : "warning"} className="readiness">
          <span className="readiness__dot" />
          {props.ready ? "Runtime ready" : "Setup required"}
        </Badge>
      </div>
      <div className="app-header__assistant">
        <CatMascot state={props.mascotState} />
        <p>{props.ready ? "Ready when you are." : "Let’s prepare the studio."}</p>
      </div>
    </header>
  );
}
