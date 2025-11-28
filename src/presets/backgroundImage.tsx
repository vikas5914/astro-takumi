import type { RenderFunctionInput } from "../types.js";
import { fetchImage } from "../util.js";

// from https://fullstackheroes.com/resources/vercel-og-templates/full-bg-image/
export async function backgroundImage({ title }: RenderFunctionInput): Promise<React.ReactNode> {
  const image = await fetchImage("https://picsum.photos/seed/picsum/1200/627");

  return Promise.resolve(
    <div tw="h-full w-full flex items-start justify-start bg-white relative">
      <div tw="flex items-start justify-start h-full w-full">
        <img tw="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} src={image} />
        {/* Avoid bg-opacity utility; use rgba overlay for compatibility */}
        <div tw="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}></div>
        <div tw="flex items-center justify-center w-full h-full relative">
          <div tw="text-[80px] text-white font-black text-center mx-20">{title}</div>
        </div>
      </div>
    </div>,
  );
}
