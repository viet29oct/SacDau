const variants = {
  primary: 'bg-forest text-white hover:bg-forest-light',
  secondary: 'bg-slate-200 text-slate-800 hover:bg-slate-300',
};

export default function Button({ children, variant = 'primary', className = '', ...props }) {
  return (
    <button
      className={`rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
