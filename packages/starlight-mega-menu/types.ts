export interface MegaMenuConfig {
  items: MegaMenuItem[];
}

export interface MegaMenuItem {
  /** Display label for the menu item */
  label: string;
  /** Simple link (no dropdown). Mutually exclusive with `content`. */
  href?: string;
  /** Dropdown panel content. Mutually exclusive with `href`. */
  content?: MegaMenuPanel;
}

export interface MegaMenuPanel {
  /** Panel layout style. Default: 'list' */
  layout?: 'grid' | 'list';
  /** Number of grid columns (only applies when layout is 'grid'). Default: 2 */
  columns?: number;
  /** Grouped link categories within the panel */
  categories?: MegaMenuCategory[];
  /** Optional footer link at the bottom of the panel */
  footer?: MegaMenuFooter;
}

export interface MegaMenuCategory {
  /** Category heading */
  title: string;
  /** Links within this category */
  items: MegaMenuLink[];
}

export interface MegaMenuLink {
  /** Display label */
  label: string;
  /** Optional description text below the label */
  description?: string;
  /** Link URL */
  href: string;
  /** Optional inline SVG string for an icon */
  icon?: string;
}

export interface MegaMenuFooter {
  /** Footer link label */
  label: string;
  /** Footer link URL */
  href: string;
  /** Optional description */
  description?: string;
}
