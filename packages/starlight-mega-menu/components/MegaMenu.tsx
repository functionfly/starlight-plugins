import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import type { MegaMenuConfig, MegaMenuPanel, MegaMenuCategory, MegaMenuLink as MegaMenuLinkType, MegaMenuFooter } from '../types';

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 4.5L6 8L9.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PanelContent({ panel }: { panel: MegaMenuPanel }) {
  const layout = panel.layout ?? 'list';
  const columns = panel.columns ?? 2;

  return (
    <div
      className="smm-panel"
      data-layout={layout}
      style={layout === 'grid' ? { '--smm-columns': columns } as React.CSSProperties : undefined}
    >
      {panel.categories?.map((category) => (
        <CategorySection key={category.title} category={category} />
      ))}
      {panel.footer && <PanelFooter footer={panel.footer} />}
    </div>
  );
}

function CategorySection({ category }: { category: MegaMenuCategory }) {
  return (
    <div className="smm-category">
      <h3 className="smm-category-title">{category.title}</h3>
      <ul className="smm-category-list">
        {category.items.map((item) => (
          <li key={item.href}>
            <LinkItem item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function LinkItem({ item }: { item: MegaMenuLinkType }) {
  return (
    <NavigationMenu.Link className="smm-menu-link" href={item.href}>
      {item.icon && (
        <span className="smm-link-icon" dangerouslySetInnerHTML={{ __html: item.icon }} />
      )}
      <span className="smm-link-text">
        <span className="smm-link-label">{item.label}</span>
        {item.description && (
          <span className="smm-link-description">{item.description}</span>
        )}
      </span>
    </NavigationMenu.Link>
  );
}

function PanelFooter({ footer }: { footer: MegaMenuFooter }) {
  return (
    <div className="smm-panel-footer">
      <NavigationMenu.Link className="smm-footer-link" href={footer.href}>
        <span className="smm-footer-label">{footer.label}</span>
        {footer.description && (
          <span className="smm-footer-description">{footer.description}</span>
        )}
        <svg
          className="smm-footer-arrow"
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1.75 7H12.25M12.25 7L7.875 2.625M12.25 7L7.875 11.375"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </NavigationMenu.Link>
    </div>
  );
}

export default function MegaMenu({ config }: { config: MegaMenuConfig }) {
  return (
    <NavigationMenu.Root className="smm-root" delayDuration={200} skipDelayDuration={300}>
      <NavigationMenu.List className="smm-list">
        {config.items.map((item) =>
          item.content ? (
            <NavigationMenu.Item key={item.label} value={item.label}>
              <NavigationMenu.Trigger className="smm-trigger">
                {item.label}
                <ChevronDown className="smm-chevron" />
              </NavigationMenu.Trigger>
              <NavigationMenu.Content className="smm-content">
                <PanelContent panel={item.content} />
              </NavigationMenu.Content>
            </NavigationMenu.Item>
          ) : (
            <NavigationMenu.Item key={item.label}>
              <NavigationMenu.Link className="smm-link" href={item.href}>
                {item.label}
              </NavigationMenu.Link>
            </NavigationMenu.Item>
          )
        )}
        <NavigationMenu.Indicator className="smm-indicator">
          <div className="smm-arrow" />
        </NavigationMenu.Indicator>
      </NavigationMenu.List>
      <div className="smm-viewport-wrapper">
        <NavigationMenu.Viewport className="smm-viewport" />
      </div>
    </NavigationMenu.Root>
  );
}
