import { Badge } from "../atoms/Badge";
import type { MascotState } from "../atoms/CatMascot";
import headerStudio from "../../assets/orange-tabby-header-background.png";

export function AppHeader(props: {
  ready: boolean;
  mascotState: MascotState;
}) {
  return (
    <header
      className="app-header"
      data-state={props.mascotState}
      style={{ backgroundImage: `url("${headerStudio}")` }}
    >
      <div className="app-header__copy">
        <h1>Local Whisper Studio</h1>
        <p className="app-header__qualities">Private <span>•</span> Local <span>•</span> Secure</p>
        <p className="app-header__lede">
          Your audio never leaves this computer.
        </p>
        <div className="hero-status">
          <Badge variant={props.ready ? "ready" : "warning"} className="readiness">
            <span className="readiness__dot" />
            {props.ready ? "Neko engine ready" : "Studio setup required"}
          </Badge>
          <span className="privacy-pill">
            <span aria-hidden="true">⌂</span>
            Local-only mode
          </span>
        </div>
      </div>
    </header>
  );
}
