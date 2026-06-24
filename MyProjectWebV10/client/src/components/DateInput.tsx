import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { isValidDateInputValue } from '../utils/taskDateInput';

interface DateInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

export function DateInput({
  value,
  onChange,
  disabled,
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}: DateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(null);
    }
  }, [value]);

  const displayValue = draft ?? value;

  const commit = (next: string) => {
    if (isValidDateInputValue(next) && next !== value) {
      onChange(next);
    }
    setDraft(null);
  };

  return (
    <input
      {...rest}
      ref={inputRef}
      type="date"
      value={displayValue}
      disabled={disabled}
      onFocus={(event) => {
        focusedRef.current = true;
        setDraft(value);
        onFocus?.(event);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={(event) => {
        focusedRef.current = false;
        commit(event.target.value);
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit(inputRef.current?.value ?? '');
          inputRef.current?.blur();
        } else if (event.key === 'Escape') {
          setDraft(null);
          inputRef.current?.blur();
        }
        onKeyDown?.(event);
      }}
    />
  );
}
