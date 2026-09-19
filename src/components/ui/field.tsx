import { useId, type InputHTMLAttributes } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, id, className = "", ...props }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = hint || error ? `${inputId}-description` : undefined;

  return (
    <label className={`field ${className}`.trim()} htmlFor={inputId}>
      <span className="field__label">{label}</span>
      <input
        id={inputId}
        className="field__input"
        aria-invalid={Boolean(error)}
        aria-describedby={descriptionId}
        {...props}
      />
      {hint || error ? (
        <span id={descriptionId} className={`field__help ${error ? "field__help--error" : ""}`}>
          {error ?? hint}
        </span>
      ) : null}
    </label>
  );
}
