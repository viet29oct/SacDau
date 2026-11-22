export default function Input({ label, error, id, ...props }) {
  const helpId = `${id}-help`;
  return (
    <div className="field">
      {label && (
        <label htmlFor={id} className="field__label">
          {label}
        </label>
      )}
      <input
        id={id}
        name={id}
        className="field__input"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? helpId : undefined}
        {...props}
      />
      <p id={helpId} className="field__help">
        {error}
      </p>
    </div>
  );
}
