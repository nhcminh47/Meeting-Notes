import {
  type ComponentType,
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";

export type SelectOption = {
  value: string | number;
  label: string;
  disabled?: boolean;
};

type SelectIcon = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean;
}>;

function ChevronIcon() {
  return (
    <svg className="select-field__chevron" viewBox="0 0 16 16" aria-hidden="true">
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

function nextEnabledIndex(
  options: SelectOption[],
  startIndex: number,
  direction: 1 | -1
) {
  if (options.length === 0) return -1;

  for (let step = 0; step < options.length; step += 1) {
    const index = (startIndex + direction * step + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }

  return -1;
}

export function SelectField(props: {
  label: string;
  value: string | number;
  options: SelectOption[];
  disabled?: boolean;
  Icon?: SelectIcon;
  onChange: (value: string | number) => void;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = useMemo(
    () => props.options.findIndex((option) => option.value === props.value),
    [props.options, props.value]
  );
  const [activeIndex, setActiveIndex] = useState(() =>
    nextEnabledIndex(props.options, Math.max(selectedIndex, 0), 1)
  );
  const selectedOption = props.options[selectedIndex];
  const activeOption = props.options[activeIndex];
  const Icon = props.Icon;
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const listboxId = `${id}-listbox`;

  useEffect(() => {
    if (!open) return;

    setActiveIndex(nextEnabledIndex(props.options, Math.max(selectedIndex, 0), 1));
  }, [open, props.options, selectedIndex]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function openWithActiveIndex(index: number) {
    const nextIndex = nextEnabledIndex(props.options, index, 1);
    if (nextIndex >= 0) {
      setActiveIndex(nextIndex);
      setOpen(true);
    }
  }

  function moveActive(direction: 1 | -1) {
    setActiveIndex((currentIndex) => {
      const fallback = selectedIndex >= 0 ? selectedIndex : 0;
      return nextEnabledIndex(
        props.options,
        currentIndex >= 0 ? currentIndex + direction : fallback,
        direction
      );
    });
  }

  function selectOption(option: SelectOption) {
    if (option.disabled) return;
    props.onChange(option.value);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (props.disabled) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (open) moveActive(1);
      else openWithActiveIndex(selectedIndex >= 0 ? selectedIndex + 1 : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (open) moveActive(-1);
      else {
        const startIndex = selectedIndex >= 0 ? selectedIndex - 1 : props.options.length - 1;
        const nextIndex = nextEnabledIndex(props.options, startIndex, -1);
        if (nextIndex >= 0) {
          setActiveIndex(nextIndex);
          setOpen(true);
        }
      }
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open && activeOption) selectOption(activeOption);
      else openWithActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className={`select-field ${open ? "select-field--open" : ""}`} ref={rootRef}>
      <span id={labelId} className="select-field__label">
        {props.label}
      </span>
      <span className="select-field__control">
        <button
          ref={triggerRef}
          className="select-field__trigger"
          type="button"
          disabled={props.disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-labelledby={`${labelId} ${valueId}`}
          onClick={() => {
            if (!props.disabled) openWithActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
          }}
          onKeyDown={handleTriggerKeyDown}
        >
          {Icon && <Icon className="select-field__leading-icon" aria-hidden />}
          <span id={valueId} className="select-field__value">
            {selectedOption?.label ?? "Select"}
          </span>
          <ChevronIcon />
        </button>
        {open && (
          <div
            id={listboxId}
            className="select-field__popover"
            role="listbox"
            aria-labelledby={labelId}
            aria-activedescendant={activeOption ? `${id}-option-${activeIndex}` : undefined}
          >
            {props.options.map((option, index) => (
              <button
                id={`${id}-option-${index}`}
                key={`${option.value}`}
                className={`select-field__option ${
                  index === activeIndex ? "select-field__option--active" : ""
                }`.trim()}
                type="button"
                role="option"
                aria-selected={option.value === props.value}
                disabled={option.disabled}
                onMouseEnter={() => {
                  if (!option.disabled) setActiveIndex(index);
                }}
                onClick={() => selectOption(option)}
              >
                <span>{option.label}</span>
                {option.value === props.value && (
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="m3 8 3 3 7-7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      </span>
    </div>
  );
}
