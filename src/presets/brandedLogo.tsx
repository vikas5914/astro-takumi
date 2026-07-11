import type { RenderFunctionInput } from "../types.js";

// from https://fullstackheroes.com/resources/vercel-og-templates/branded-logo/
// Logo mark uses simple SVG geometry (complex multi-subpath wordmarks rasterize unreliably).
// Replace the mark and "Your Brand" text with your own logo.
export async function brandedLogo({ title }: RenderFunctionInput): Promise<React.ReactNode> {
  return Promise.resolve(
    <div
      tw="h-full w-full flex items-start justify-start"
      style={{ backgroundImage: "linear-gradient(to right, #24243e, #302b63, #0f0c29)" }}
    >
      <div tw="flex items-start justify-start h-full">
        <div tw="flex flex-col justify-between w-full h-full p-20">
          <div tw="flex items-center" style={{ gap: 16 }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="44" height="44" rx="12" fill="white" fillOpacity="0.12" />
              <path d="M24 10L36 32H12L24 10Z" stroke="white" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
              <circle cx="24" cy="26" r="4" fill="white" />
            </svg>
            <div tw="text-white text-[36px] font-bold tracking-tight">Your Brand</div>
          </div>

          <h1 tw="text-[60px] text-white font-bold text-left m-0">{title}</h1>
        </div>
      </div>
    </div>,
  );
}
