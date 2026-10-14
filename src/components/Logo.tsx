// "malp" no estilo headline + quadrado signal de 0.22em alinhado à base
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`logo headline ${className}`} aria-label="malp">
      malp
      <span className="logo-square" aria-hidden="true" />
    </span>
  );
}
