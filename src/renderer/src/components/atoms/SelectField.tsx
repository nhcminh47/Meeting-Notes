import type { ChangeEvent, ReactNode } from "react";

export function SelectField(props: {
  label: string;
  value: string | number;
  disabled?: boolean;
  children: ReactNode;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <label className="select-field">
      <span>{props.label}</span>
      <select value={props.value} onChange={props.onChange} disabled={props.disabled}>
        {props.children}
      </select>
    </label>
  );
}
