import { useId, useState } from 'react';
import type { KeyboardEvent } from 'react';

export function ActivityCombobox({
  label,
  value,
  options,
  disabled,
  minLength = 1,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; detail?: string }[];
  disabled: boolean;
  minLength?: number;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(-1);
  const visible = options.filter((option) =>
    option.value
      .toLocaleLowerCase('es')
      .includes(filter.toLocaleLowerCase('es')),
  );
  function expand() {
    setFilter('');
    setActive(-1);
    setOpen(true);
  }
  function select(next: string) {
    onChange(next);
    setOpen(false);
    setActive(-1);
  }
  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) expand();
      else
        setActive((previous) =>
          event.key === 'ArrowDown'
            ? Math.min(previous + 1, visible.length - 1)
            : Math.max(previous - 1, 0),
        );
    } else if (
      event.key === 'Enter' &&
      open &&
      active >= 0 &&
      visible[active]
    ) {
      event.preventDefault();
      select(visible[active].value);
    }
  }
  return (
    <div
      className="activity-combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="activity-combobox-control">
        <input
          id={id}
          role="combobox"
          value={value}
          required
          minLength={minLength}
          maxLength={180}
          disabled={disabled}
          autoComplete="off"
          placeholder={placeholder}
          aria-autocomplete="list"
          aria-expanded={open && !disabled}
          aria-controls={`${id}-options`}
          aria-activedescendant={
            open && active >= 0 ? `${id}-option-${active}` : undefined
          }
          onFocus={expand}
          onKeyDown={navigate}
          onChange={(event) => {
            onChange(event.target.value);
            setFilter(event.target.value);
            setActive(-1);
            setOpen(true);
          }}
        />
        <button
          type="button"
          className="activity-combobox-toggle"
          aria-label={`Mostrar opciones de ${label.toLocaleLowerCase('es')}`}
          disabled={disabled}
          aria-expanded={open && !disabled}
          aria-controls={`${id}-options`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) setOpen(false);
            else expand();
          }}
        >
          <span aria-hidden="true">▾</span>
        </button>
      </div>
      {open && !disabled && (
        <div className="activity-combobox-popup">
          <div
            id={`${id}-options`}
            role="listbox"
            aria-label={`Opciones de ${label.toLocaleLowerCase('es')}`}
          >
            {visible.map((option, index) => (
              <button
                key={option.value}
                type="button"
                role="option"
                tabIndex={-1}
                id={`${id}-option-${index}`}
                aria-selected={active === index}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(option.value)}
              >
                <span>{option.value}</span>
                {option.detail && <small>{option.detail}</small>}
              </button>
            ))}
          </div>
          {!visible.length && <p>No hay opciones guardadas que coincidan.</p>}
          <p className="activity-combobox-hint">
            También puedes escribir una opción nueva.
          </p>
        </div>
      )}
    </div>
  );
}
