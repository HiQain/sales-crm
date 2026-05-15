import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { formatUsPhoneInput } from '../utils/phone';

type PhoneCellEditorProps = {
  value?: string | null;
};

const PhoneCellEditor = forwardRef<{ getValue: () => string }, PhoneCellEditorProps>(
  ({ value }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [currentValue, setCurrentValue] = useState(() => formatUsPhoneInput(value));

    useEffect(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, []);

    useImperativeHandle(ref, () => ({
      getValue: () => currentValue,
    }), [currentValue]);

    return (
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        value={currentValue}
        onChange={(event) => setCurrentValue(formatUsPhoneInput(event.target.value))}
        className="h-full w-full bg-transparent px-2 outline-none"
      />
    );
  },
);

PhoneCellEditor.displayName = 'PhoneCellEditor';

export default PhoneCellEditor;
