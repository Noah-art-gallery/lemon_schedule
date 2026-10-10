# Shared UI components

## Button — `src/components/ui/button.tsx`

Reusable primary, secondary, ghost, and danger action button with sizes and a loading state.

```tsx
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  const classes = [
    "button",
    `button--${variant}`,
    `button--${size}`,
    fullWidth ? "button--full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={classes} disabled={disabled || loading} aria-busy={loading} {...props}>
      {loading ? <span className="button__spinner" aria-hidden="true" /> : null}
      <span>{loading ? "잠시만요" : children}</span>
    </button>
  );
}
```

## Card — `src/components/ui/card.tsx`

Surface container with plain, lemon, or leaf tone.

```tsx
export function Card({ as: Element = "div", tone = "plain", className = "", ...props }: CardProps) {
  return <Element className={`card card--${tone} ${className}`.trim()} {...props} />;
}
```

## Field — `src/components/ui/field.tsx`

Accessible labelled text field supporting hint and error text.

```tsx
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
```
