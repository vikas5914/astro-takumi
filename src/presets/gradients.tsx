import type { RenderFunctionInput } from "../types.js";

export async function gradients({ title, description }: RenderFunctionInput): Promise<React.ReactNode> {
  return Promise.resolve(
    <div
      style={{
        display: "flex",
        height: "100%",
        width: "100%",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        backgroundColor: "#ffffff",
        fontSize: 40,
        letterSpacing: -2,
        fontWeight: 700,
        textAlign: "center",
        backgroundImage: "linear-gradient(to bottom, #dbf4ff, #fff1f1)",
      }}
    >
      <div style={{ color: "#007cf0" }}>{title}</div>
      <div style={{ color: "#ff0080" }}>{description ?? ""}</div>
    </div>,
  );
}
