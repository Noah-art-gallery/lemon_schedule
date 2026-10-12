import { useId, type InputHTMLAttributes } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Field({
  label,
  hint,
  error,
  id,
  className = "",
  "aria-describedby": externalDescription,
  "aria-invalid": invalid,
  ...props
}: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = hint || error ? `${inputId}-description` : undefined;
  const describedBy = [externalDescription, descriptionId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`field ${className}`.trim()}>
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="field__input"
        aria-invalid={error ? true : (invalid ?? false)}
        aria-describedby={describedBy}
        {...props}
      />
      {hint || error ? (
        <span
          id={descriptionId}
          role={error ? "alert" : undefined}
          className={`field__help ${error ? "field__help--error" : ""}`}
        >
          {error ?? hint}
        </span>
      ) : null}
    </div>
  );
}
