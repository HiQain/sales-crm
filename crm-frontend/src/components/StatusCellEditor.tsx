import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

type StatusCellEditorProps = {
  value?: string | null;
  values?: string[];
};

const DEFAULT_STATUS_OPTIONS = ['pending', 'contacted', 'paid', 'failed'];

const StatusCellEditor = forwardRef<{ getValue: () => string }, StatusCellEditorProps>(
  ({ value, values }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const valueRef = useRef(String(value ?? ''));
    const [currentValue, setCurrentValue] = useState(() => valueRef.current);
    const listIdRef = useRef(`status-options-${Math.random().toString(36).slice(2, 10)}`);
    const options = values?.length ? values : DEFAULT_STATUS_OPTIONS;

    useEffect(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, []);

    useImperativeHandle(ref, () => ({
      getValue: () => valueRef.current.trim(),
    }), []);

    const handleValueChange = (nextValue: string) => {
      valueRef.current = nextValue;
      setCurrentValue(nextValue);
    };

    const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
      const keysToKeepInInput = [
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
        'PageUp',
        'PageDown',
      ];

      if (keysToKeepInInput.includes(event.key)) {
        event.stopPropagation();
      }
    };

    return (
      <>
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          list={listIdRef.current}
          value={currentValue}
          onChange={(event) => handleValueChange(event.target.value)}
          onInput={(event) => handleValueChange(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          className="h-full w-full bg-transparent px-2 outline-none"
          placeholder="Type or select status"
        />
        <datalist id={listIdRef.current}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </>
    );
  },
);

StatusCellEditor.displayName = 'StatusCellEditor';

export default StatusCellEditor;
