import { Button } from "../atoms/Button";
import folderIcon from "../../assets/icons/files-folder.png";
import pawAccentIcon from "../../assets/icons/paw-accent.png";

export function FilePicker(props: {
  fileName?: string;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <div className={`file-picker ${props.fileName ? "file-picker--selected" : ""}`}>
      <div className="file-picker__copy">
        <span className="file-picker__icon" aria-hidden="true">
          <svg viewBox="0 0 66 54">
            <path d="M21 44h-7C7.4 44 2 38.6 2 32s5.4-12 12-12c1.8 0 3.4.4 4.9 1C21.6 10 30.8 2 41.8 2 54.1 2 64 11.9 64 24.2 64 35.2 57.4 44 47 44h-3" />
            <path d="M33 50V20m0 0-10 10m10-10 10 10" />
          </svg>
        </span>
        <span className="file-picker__text">
          <strong>{props.fileName ? "Audio loaded" : "Drop your audio here"}</strong>
          <span>{props.fileName ?? "or click to browse files"}</span>
        </span>
      </div>
      <Button
        variant="primary"
        className="file-picker__button"
        onClick={props.onPick}
        disabled={props.disabled}
      >
        <img className="button__asset-icon" src={folderIcon} alt="" />
        {props.fileName ? "Choose another file" : "Browse files"}
      </Button>
      <span className="file-picker__formats">
        Supports: mp3, wav, m4a, flac, ogg, webm
      </span>
      <div className="file-picker__accent" aria-hidden="true">
        <span className="file-picker__spark">+</span>
        <div className="file-picker__wave">
          {Array.from({ length: 13 }, (_, index) => <span key={index} />)}
        </div>
        <img className="file-picker__paw" src={pawAccentIcon} alt="" />
      </div>
      <img
        className="file-picker__corner-paw"
        src={pawAccentIcon}
        alt=""
        aria-hidden="true"
      />
    </div>
  );
}
