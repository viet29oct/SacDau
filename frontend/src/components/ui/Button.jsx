const variants = {
  primary: 'btn btn--primary',
  secondary: 'btn',
};

export default function Button({ children, variant = 'primary', className = '', type = 'button', ...props }) {
  return (
    <button type={type} className={`${variants[variant]} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
