import { Button } from "../atoms/Button";

export function FilePicker(props: {
  fileName?: string;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <div className={`file-picker ${props.fileName ? "file-picker--selected" : ""}`}>
      <Button variant="secondary" onClick={props.onPick} disabled={props.disabled}>
        Choose audio file
      </Button>
      <span className="file-picker__name">
        {props.fileName ?? "No file selected"}
      </span>
    </div>
  );
}
