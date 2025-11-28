import type {} from "react";

declare module "react" {
  interface HTMLAttributes<_T> extends AriaAttributes, DOMAttributes<_T> {
    tw?: string;
  }

  interface ImgHTMLAttributes<_T> extends HTMLAttributes<_T> {
    tw?: string;
  }

  interface SVGProps<_T> extends SVGAttributes<_T>, ClassAttributes<_T> {
    tw?: string;
    children?: React.ReactNode;
    d?: string;
    fill?: string;
    fillRule?: string;
    clipRule?: string;
    transform?: string;
  }
}
