import type { RenderFunctionInput } from "../types.js";

export async function tailwind({ title, description }: RenderFunctionInput): Promise<React.ReactNode> {
  return Promise.resolve(
    // Based on Tailwind UI CTA; avoids responsive variants for compatibility
    <div tw="flex flex-col w-full h-full items-center justify-center bg-white">
      <div tw="bg-gray-50 flex w-full">
        <div tw="flex flex-row w-full py-12 px-8 items-center justify-between">
          <h2 tw="flex flex-col font-bold tracking-tight text-gray-900 text-left text-[48px]">
            <span>{title}</span>
            <span tw="text-indigo-600 text-[36px]">{description}</span>
          </h2>
        </div>
      </div>
    </div>,
  );
}
