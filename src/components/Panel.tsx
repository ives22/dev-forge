import type { FocusEventHandler, ReactNode } from "react";

export function Panel({
  title,
  actions,
  children,
  className = ""
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="panel-topbar">
          <div className="panel-title">{title}</div>
          <div className="panel-actions">{actions}</div>
        </div>
      )}
      {children}
    </section>
  );
}

export function EditorPanel({
  title,
  actions,
  value,
  onChange,
  onBlur,
  readOnly,
  footerLeft,
  footerRight,
  className = "",
  textareaClassName = "",
  rows = 4,
  showLineNumbers = true
}: {
  title: ReactNode;
  actions?: ReactNode;
  value: string;
  onChange?: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLTextAreaElement>;
  readOnly?: boolean;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  className?: string;
  textareaClassName?: string;
  rows?: number;
  showLineNumbers?: boolean;
}) {
  return (
    <section className={`panel editor-panel ${className}`}>
      <div className="panel-topbar">
        <div className="panel-title">{title}</div>
        <div className="panel-actions">{actions}</div>
      </div>
      <div className={`editor-body ${showLineNumbers ? "" : "no-line-numbers"}`}>
        {showLineNumbers ? (
          <div className="line-gutter" aria-hidden="true">
            {Array.from({ length: rows }, (_, index) => (
              <span key={index}>{index + 1}</span>
            ))}
          </div>
        ) : null}
        <textarea
          className={`editor-textarea ${textareaClassName}`}
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange?.(event.target.value)}
          onBlur={onBlur}
          spellCheck={false}
        />
      </div>
      <div className="editor-footer">
        <span>{footerLeft}</span>
        <span>{footerRight}</span>
      </div>
    </section>
  );
}

export function Field({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Button({
  children,
  variant = "default",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "danger" }) {
  return (
    <button className={`tool-action ${variant === "primary" ? "primary" : ""} ${variant === "danger" ? "danger" : ""} ${className}`} type="button" {...props}>
      {children}
    </button>
  );
}

export function SwitchToggle({
  checked,
  onChange,
  title,
  hint
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  hint?: string;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="switch" />
      <span className="toggle-copy">
        <span className="toggle-title">{title}</span>
        {hint ? <span className="toggle-hint">{hint}</span> : null}
      </span>
    </label>
  );
}

export function SegmentButton({
  active,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button className={`segment-btn ${active ? "active" : ""}`} type="button" aria-pressed={active} {...props}>
      {children}
    </button>
  );
}
