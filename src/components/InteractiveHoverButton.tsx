import React from 'react';
import { ArrowRight } from 'lucide-react';

type Variant = 'signal' | 'ink' | 'outline' | 'outlineLight';
type Size = 'sm' | 'md' | 'lg';

type CommonProps = {
  variant?: Variant;
  size?: Size;
  children: React.ReactNode;
  className?: string;
};

type ButtonProps = CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type AnchorProps = CommonProps & React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

// Hover: a bolinha da esquerda se expande e preenche o botão, o texto sai pela direita e entra uma seta.
export function InteractiveHoverButton(props: ButtonProps | AnchorProps) {
  const { variant = 'ink', size = 'md', children, className = '', ...rest } = props;
  const classes = `ihb ihb-${variant} ihb-${size} ${className}`;

  const content = (
    <>
      <span className="ihb-dot" aria-hidden="true" />
      <span className="ihb-label">{children}</span>
      <span className="ihb-hover" aria-hidden="true">
        {children}
        <ArrowRight size={18} strokeWidth={2.5} />
      </span>
    </>
  );

  if ('href' in rest && rest.href !== undefined) {
    return (
      <a className={classes} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {content}
    </button>
  );
}
