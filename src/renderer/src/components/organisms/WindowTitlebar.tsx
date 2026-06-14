import appPawIcon from "../../assets/icons/app-paw.png";

export function WindowTitlebar(props: {
  maximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}) {
  return (
    <header className="window-titlebar">
      <div className="window-titlebar__identity">
        <img className="window-titlebar__mark" src={appPawIcon} alt="" />
        <span>Local Whisper Studio</span>
      </div>
      <div className="window-titlebar__controls">
        <button type="button" aria-label="Minimize window" onClick={props.onMinimize}>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 8.5h8" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={props.maximized ? "Restore window" : "Maximize window"}
          onClick={props.onToggleMaximize}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            {props.maximized ? (
              <>
                <path d="M3.5 2.5h6v6" />
                <rect x="2" y="4" width="6" height="6" rx="0.5" />
              </>
            ) : (
              <rect x="2" y="2" width="8" height="8" rx="0.5" />
            )}
          </svg>
        </button>
        <button
          className="window-titlebar__close"
          type="button"
          aria-label="Close window"
          onClick={props.onClose}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="m2.5 2.5 7 7m0-7-7 7" />
          </svg>
        </button>
      </div>
    </header>
  );
}
