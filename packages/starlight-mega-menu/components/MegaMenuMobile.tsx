import { useState, useEffect, useCallback, useRef } from 'react';
import type { MegaMenuConfig } from '../types';

function HamburgerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 12H21M3 6H21M3 18H21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M18 6L6 18M6 6L18 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MegaMenuMobile({ config }: { config: MegaMenuConfig }) {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        close();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Focus trap: focus the dialog when it opens
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        className="smm-mobile-button"
        onClick={() => setIsOpen(true)}
        aria-expanded={isOpen}
        aria-label="Open navigation menu"
      >
        <HamburgerIcon />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="smm-mobile-backdrop" onClick={close} />

          {/* Overlay panel */}
          <div
            ref={dialogRef}
            className="smm-mobile-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            tabIndex={-1}
          >
            <div className="smm-mobile-header">
              <span className="smm-mobile-title">Menu</span>
              <button
                className="smm-mobile-close"
                onClick={close}
                aria-label="Close navigation menu"
              >
                <CloseIcon />
              </button>
            </div>

            <nav className="smm-mobile-nav">
              {config.items.map((item) =>
                item.content ? (
                  <details key={item.label} className="smm-mobile-section">
                    <summary className="smm-mobile-summary">
                      {item.label}
                      <svg
                        className="smm-mobile-chevron"
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M4 6L8 10L12 6"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </summary>
                    <div className="smm-mobile-panel">
                      {item.content.categories?.map((category) => (
                        <div key={category.title} className="smm-mobile-category">
                          <h3 className="smm-mobile-category-title">{category.title}</h3>
                          <ul className="smm-mobile-category-list">
                            {category.items.map((link) => (
                              <li key={link.href}>
                                <a
                                  className="smm-mobile-link"
                                  href={link.href}
                                  onClick={close}
                                >
                                  {link.icon && (
                                    <span
                                      className="smm-mobile-link-icon"
                                      dangerouslySetInnerHTML={{ __html: link.icon }}
                                    />
                                  )}
                                  <span className="smm-mobile-link-text">
                                    <span className="smm-mobile-link-label">{link.label}</span>
                                    {link.description && (
                                      <span className="smm-mobile-link-desc">{link.description}</span>
                                    )}
                                  </span>
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                      {item.content.footer && (
                        <a
                          className="smm-mobile-footer-link"
                          href={item.content.footer.href}
                          onClick={close}
                        >
                          {item.content.footer.label}
                        </a>
                      )}
                    </div>
                  </details>
                ) : (
                  <a
                    key={item.label}
                    className="smm-mobile-top-link"
                    href={item.href}
                    onClick={close}
                  >
                    {item.label}
                  </a>
                )
              )}
            </nav>
          </div>
        </>
      )}
    </>
  );
}
