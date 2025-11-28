import type { RenderFunctionInput } from "../types.js";

// This preset demonstrates how to extract arbitrary content from an HTML file
// and render it in an Open Graph image.
export async function customProperty({ title, document }: RenderFunctionInput): Promise<React.ReactNode> {
  // extract the body
  const body = document.querySelector("body")?.textContent ?? "";
  // replace newlines with spaces, trim, then truncate to 50 characters, add ellipsis if truncated
  const bodyClean = body.replace(/\n/g, " ").trim();
  const bodyTruncated = bodyClean.substring(0, 50) + (bodyClean.length > 50 ? "..." : "");

  return Promise.resolve(
    <div tw="h-full w-full flex items-start justify-start border border-blue-500 border-[12px] bg-gray-50">
      <div tw="flex items-start justify-start h-full">
        <div tw="flex flex-col justify-between w-full h-full">
          <h1 tw="text-[80px] p-20 font-black text-left">{title}</h1>
          <div tw="text-2xl pb-10 px-20 font-bold mb-0">{bodyTruncated}</div>
        </div>
      </div>
    </div>,
  );
}
